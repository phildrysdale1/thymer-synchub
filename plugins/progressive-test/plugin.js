/**
 * Progressive Markdown Test Plugin
 *
 * Test harness for debugging progressive markdown rendering.
 * Simulates LLM-style streaming and renders markdown progressively.
 */

class Plugin extends AppPlugin {

    async onLoad() {
        console.log('[ProgTest] Loading progressive markdown test plugin');

        this.cmd = this.ui.addCommandPaletteCommand({
            label: 'Progressive Paste Markdown',
            icon: 'flask',
            onSelected: () => this.runTest(),
        });

        console.log('[ProgTest] Ready. Use command palette: "Progressive Paste Markdown"');
    }

    onUnload() {
        this.cmd?.remove();
    }

    // =========================================================================
    // Test Runner
    // =========================================================================

    async runTest() {
        console.log('[ProgTest] === Starting Progressive Markdown Test ===');

        // Get current page
        const record = await this.getCurrentRecord();
        if (!record) {
            console.error('[ProgTest] No current record found');
            this.ui.addToaster({
                title: 'Progressive Test',
                message: 'Please open a page first',
                dismissible: true,
            });
            return;
        }

        console.log('[ProgTest] Target record:', record.getName(), record.guid);

        // Create the label item (simulating "Agent:")
        const labelItem = await record.createLineItem(null, null, 'text');
        labelItem?.setSegments([{ type: 'bold', text: 'Test Output:' }]);
        console.log('[ProgTest] Created label item:', labelItem?.guid);

        // Initialize renderer
        const renderer = this.createProgressiveRenderer(record, labelItem);
        await renderer.init();
        console.log('[ProgTest] Renderer initialized');

        // Test markdown content
        const testMarkdown = this.getTestMarkdown();
        console.log('[ProgTest] Test content length:', testMarkdown.length);

        // Simulate streaming
        await this.simulateStreaming(testMarkdown, renderer);

        console.log('[ProgTest] === Test Complete ===');
    }

    async getCurrentRecord() {
        // Use the ACTIVE record the user is viewing, not just any record
        const record = this.ui.getActivePanel()?.getActiveRecord();

        if (!record) {
            console.error('[ProgTest] No active record - is a page open?');
        }

        return record;
    }

    getTestMarkdown() {
        return `Here is a summary of the changes:

## Overview

This update includes several improvements:

- Better error handling
- Improved performance
- New features

## Code Example

\`\`\`javascript
function hello() {
    console.log("Hello world!");
    return 42;
}
\`\`\`

The function above demonstrates basic syntax.

## Another Section

Here's a numbered list:

1. First item
2. Second item
3. Third item

And some **bold** and *italic* text with \`inline code\`.

> This is a blockquote
> that spans multiple lines

That's all for now!`;
    }

    // =========================================================================
    // Streaming Simulator
    // =========================================================================

    async simulateStreaming(text, renderer) {
        console.log('[ProgTest] Starting simulated stream...');

        let streamed = '';
        const chunkSizes = [1, 2, 3, 5, 8]; // Variable chunk sizes like real LLM
        let chunkIndex = 0;

        for (let i = 0; i < text.length; ) {
            // Variable chunk size
            const chunkSize = chunkSizes[chunkIndex % chunkSizes.length];
            chunkIndex++;

            const chunk = text.slice(i, i + chunkSize);
            streamed += chunk;
            i += chunkSize;

            // Update renderer (non-blocking - just chains promises)
            renderer.update(streamed);

            // Variable delay (20-80ms, like real streaming)
            const delay = 20 + Math.random() * 60;
            await this.sleep(delay);
        }

        // Finalize
        console.log('[ProgTest] Stream complete, finalizing...');
        await renderer.finalize();
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // =========================================================================
    // Progressive Renderer
    // =========================================================================

    createProgressiveRenderer(record, labelItem) {
        const self = this;

        return {
            record,
            labelItem,
            previewItem: null,
            previewChild: null,

            processedLength: 0,
            buffer: '',

            inCodeBlock: false,
            codeBlockLang: '',
            codeBlockLines: [],

            renderedCount: 0,
            errorCount: 0,
            aborted: false,
            lastItemPromise: null,  // Promise chain for ordering

            async init() {
                console.log('[Renderer] Initializing...');

                // Start promise chain with the label item
                this.lastItemPromise = Promise.resolve(this.labelItem);

                // Create preview item
                try {
                    this.previewItem = await this.record.createLineItem(
                        null, this.labelItem, 'text'
                    );
                    console.log('[Renderer] Preview item created:', this.previewItem?.guid);
                } catch (e) {
                    console.error('[Renderer] Failed to create preview item:', e);
                    // Continue without preview - not fatal
                }

                // Preview child is the preview item itself
                this.previewChild = this.previewItem;
            },

            // Call to stop rendering (e.g., user navigated away)
            abort() {
                this.aborted = true;
                console.log('[Renderer] Aborted');
                this.cleanup();
            },

            cleanup() {
                // Clear preview item if it exists
                try {
                    this.previewItem?.setSegments([]);
                } catch (e) {
                    // Item might be gone, ignore
                }
            },

            update(fullText) {
                if (this.aborted) return;

                const newText = fullText.slice(this.processedLength);
                if (!newText) return;

                // Process character by character
                for (const char of newText) {
                    if (this.aborted) break;
                    this.buffer += char;
                    this.processedLength++;

                    if (this.inCodeBlock) {
                        // Check for closing ```
                        if (this.buffer.endsWith('\n```\n') ||
                            this.buffer.endsWith('\n```') && fullText.length === this.processedLength) {

                            // Extract code block content
                            const endMarker = this.buffer.endsWith('\n```\n') ? '\n```\n' : '\n```';
                            const content = this.buffer.slice(0, -endMarker.length);

                            console.log('[Renderer] Code block complete:', {
                                lang: this.codeBlockLang,
                                lines: content.split('\n').length
                            });

                            this.renderCodeBlock(this.codeBlockLang, content);  // No await - chains promise
                            this.buffer = '';
                            this.inCodeBlock = false;
                            this.codeBlockLang = '';
                        }
                    } else if (char === '\n') {
                        // Complete line
                        const line = this.buffer.slice(0, -1); // Remove \n

                        if (line.startsWith('```')) {
                            // Starting code block
                            this.inCodeBlock = true;
                            this.codeBlockLang = line.slice(3).trim();
                            this.buffer = ''; // Don't include opening marker
                            console.log('[Renderer] Code block starting:', this.codeBlockLang);
                        } else if (line.trim()) {
                            // Regular line
                            console.log('[Renderer] Rendering line:', line.slice(0, 40) + (line.length > 40 ? '...' : ''));
                            this.renderLine(line);  // No await - chains promise
                            this.buffer = '';
                        } else {
                            // Empty line - skip
                            this.buffer = '';
                        }
                    }

                    // Update preview with current buffer
                    this.updatePreview();
                }
            },

            renderLine(line) {
                if (this.aborted) return;

                const { type, segments } = this.parseLine(line);
                const rendererSelf = this;

                // Validate segments
                if (!segments || !Array.isArray(segments) || segments.length === 0) {
                    console.warn('[Renderer] Invalid segments for line:', line.slice(0, 30));
                    return;
                }

                console.log('[Renderer] Creating line item:', { type, segmentCount: segments.length });

                // Chain off the previous promise - non-blocking!
                this.lastItemPromise = this.lastItemPromise.then(async (lastItem) => {
                    if (rendererSelf.aborted) return lastItem;

                    try {
                        const item = await rendererSelf.record.createLineItem(null, lastItem, type);
                        if (item) {
                            item.setSegments(segments);
                            rendererSelf.renderedCount++;
                            console.log('[Renderer] Line rendered #' + rendererSelf.renderedCount, item.guid);
                            return item;  // Pass to next in chain
                        }
                        // createLineItem returned null
                        rendererSelf.errorCount++;
                        console.warn('[Renderer] createLineItem returned null');
                        return lastItem;
                    } catch (e) {
                        rendererSelf.errorCount++;
                        console.error('[Renderer] Failed to create line:', e);
                        return lastItem;
                    }
                });
            },

            renderCodeBlock(lang, content) {
                if (this.aborted) return;

                const lines = content.split('\n');
                const rendererSelf = this;

                console.log('[Renderer] Creating code block:', { lang, lineCount: lines.length });

                // Chain off the previous promise
                this.lastItemPromise = this.lastItemPromise.then(async (lastItem) => {
                    if (rendererSelf.aborted) return lastItem;

                    try {
                        const blockItem = await rendererSelf.record.createLineItem(null, lastItem, 'block');
                        if (!blockItem) {
                            rendererSelf.errorCount++;
                            console.error('[Renderer] Failed to create block item');
                            return lastItem;
                        }

                        // Set language
                        const normalizedLang = self.normalizeLanguage(lang);
                        try {
                            blockItem.setHighlightLanguage?.(normalizedLang);
                        } catch (e) {
                            // Not fatal - just won't have syntax highlighting
                        }
                        blockItem.setSegments([]);

                        console.log('[Renderer] Block created:', blockItem.guid);

                        // Add each line as child (these can be sequential within the block)
                        let lastLine = null;
                        for (const codeLine of lines) {
                            if (rendererSelf.aborted) break;

                            const lineItem = await rendererSelf.record.createLineItem(
                                blockItem, lastLine, 'text'
                            );
                            if (lineItem) {
                                lineItem.setSegments([{ type: 'text', text: codeLine }]);
                                lastLine = lineItem;
                            }
                        }

                        rendererSelf.renderedCount++;
                        console.log('[Renderer] Code block rendered #' + rendererSelf.renderedCount);
                        return blockItem;  // Pass to next in chain
                    } catch (e) {
                        rendererSelf.errorCount++;
                        console.error('[Renderer] Failed to create block:', e);
                        return lastItem;
                    }
                });
            },

            updatePreview() {
                if (!this.previewChild || this.aborted) return;

                try {
                    const display = this.buffer || '';
                    const isCode = this.inCodeBlock;

                    if (display) {
                        this.previewChild.setSegments([
                            { type: isCode ? 'code' : 'text', text: display },
                            { type: 'code', text: '█' }
                        ]);
                    } else {
                        this.previewChild.setSegments([
                            { type: 'code', text: '█' }
                        ]);
                    }
                } catch (e) {
                    // Preview item might be gone, ignore
                }
            },

            async finalize() {
                console.log('[Renderer] Finalizing...');

                if (this.aborted) {
                    console.log('[Renderer] Finalize skipped - aborted');
                    return { rendered: this.renderedCount, errors: this.errorCount, aborted: true };
                }

                // Render any remaining buffer
                if (this.buffer.trim()) {
                    if (this.inCodeBlock) {
                        // Unclosed code block - render what we have
                        console.log('[Renderer] Rendering unclosed code block');
                        this.renderCodeBlock(this.codeBlockLang, this.buffer);
                    } else {
                        console.log('[Renderer] Rendering remaining buffer:', this.buffer);
                        this.renderLine(this.buffer);
                    }
                }

                // Wait for all pending renders to complete
                try {
                    await this.lastItemPromise;
                    console.log('[Renderer] All promises resolved');
                } catch (e) {
                    console.error('[Renderer] Promise chain error:', e);
                    this.errorCount++;
                }

                // Show result
                const hasErrors = this.errorCount > 0;
                try {
                    if (hasErrors) {
                        this.previewItem?.setSegments([
                            { type: 'text', text: `⚠ Done with ${this.errorCount} error(s)` }
                        ]);
                    } else {
                        this.previewItem?.setSegments([
                            { type: 'text', text: '✓ Complete' }
                        ]);
                    }

                    // Wait a moment then clear the preview entirely
                    await self.sleep(1000);
                    this.previewItem?.setSegments([]);
                } catch (e) {
                    // Preview item might be gone, ignore
                }

                console.log('[Renderer] Finalized. Rendered:', this.renderedCount, 'Errors:', this.errorCount);
                return { rendered: this.renderedCount, errors: this.errorCount, aborted: false };
            },

            parseLine(line) {
                let text = line;
                let type = 'text';

                // Detect line type
                const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
                if (headerMatch) {
                    text = headerMatch[2];
                    type = 'heading';
                    return { type, segments: [{ type: 'text', text }] };
                }

                // Unordered list
                const ulMatch = line.match(/^[-*]\s+(.+)$/);
                if (ulMatch) {
                    text = ulMatch[1];
                    type = 'ulist';
                }

                // Ordered list
                const olMatch = line.match(/^\d+\.\s+(.+)$/);
                if (olMatch) {
                    text = olMatch[1];
                    type = 'olist';
                }

                // Blockquote
                if (line.startsWith('> ')) {
                    text = line.slice(2);
                    type = 'quote';
                }

                // Parse inline formatting
                const segments = this.parseInlineFormatting(text);

                return { type, segments };
            },

            parseInlineFormatting(text) {
                // Use SyncHub's parser if available
                if (window.syncHub?.parseInlineFormatting) {
                    return window.syncHub.parseInlineFormatting(text);
                }

                // Simple fallback parser
                const segments = [];
                let remaining = text;

                while (remaining.length > 0) {
                    // Bold **text**
                    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
                    if (boldMatch) {
                        segments.push({ type: 'bold', text: boldMatch[1] });
                        remaining = remaining.slice(boldMatch[0].length);
                        continue;
                    }

                    // Italic *text*
                    const italicMatch = remaining.match(/^\*(.+?)\*/);
                    if (italicMatch) {
                        segments.push({ type: 'italic', text: italicMatch[1] });
                        remaining = remaining.slice(italicMatch[0].length);
                        continue;
                    }

                    // Inline code `text`
                    const codeMatch = remaining.match(/^`(.+?)`/);
                    if (codeMatch) {
                        segments.push({ type: 'code', text: codeMatch[1] });
                        remaining = remaining.slice(codeMatch[0].length);
                        continue;
                    }

                    // Regular text until next special char
                    const nextSpecial = remaining.search(/[\*`]/);
                    if (nextSpecial > 0) {
                        segments.push({ type: 'text', text: remaining.slice(0, nextSpecial) });
                        remaining = remaining.slice(nextSpecial);
                    } else {
                        segments.push({ type: 'text', text: remaining });
                        break;
                    }
                }

                return segments.length > 0 ? segments : [{ type: 'text', text }];
            },
        };
    }

    normalizeLanguage(lang) {
        if (!lang) return 'plaintext';
        const aliases = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'rb': 'ruby',
            'sh': 'bash',
            'yml': 'yaml',
        };
        return aliases[lang.toLowerCase()] || lang.toLowerCase();
    }
}
