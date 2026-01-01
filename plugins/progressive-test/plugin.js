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

            // Update renderer
            await renderer.update(streamed);

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
            lastRenderedItem: null,  // Track last item for ordering

            async init() {
                console.log('[Renderer] Initializing...');

                // Track where to insert next item (starts after label)
                this.lastRenderedItem = this.labelItem;

                // Create preview item - will be moved as we render
                this.previewItem = await this.record.createLineItem(
                    null, this.labelItem, 'text'
                );
                console.log('[Renderer] Preview item created:', this.previewItem?.guid);

                // Preview child is the preview item itself
                this.previewChild = this.previewItem;
            },

            async update(fullText) {
                const newText = fullText.slice(this.processedLength);
                if (!newText) return;

                // Process character by character
                for (const char of newText) {
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

                            await this.renderCodeBlock(this.codeBlockLang, content);
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
                            await this.renderLine(line);
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

            async renderLine(line) {
                const { type, segments } = this.parseLine(line);

                console.log('[Renderer] Creating line item:', { type, segmentCount: segments.length });

                try {
                    // Create AFTER the last rendered item (maintains order)
                    const item = await this.record.createLineItem(null, this.lastRenderedItem, type);
                    if (item) {
                        item.setSegments(segments);
                        this.lastRenderedItem = item;  // Next item goes after this one
                        this.renderedCount++;
                        console.log('[Renderer] Line rendered #' + this.renderedCount, item.guid);
                    }
                } catch (e) {
                    console.error('[Renderer] Failed to create line:', e);
                }
            },

            async renderCodeBlock(lang, content) {
                const lines = content.split('\n');

                console.log('[Renderer] Creating code block:', { lang, lineCount: lines.length });

                try {
                    // Create block AFTER the last rendered item
                    const blockItem = await this.record.createLineItem(null, this.lastRenderedItem, 'block');
                    if (!blockItem) {
                        console.error('[Renderer] Failed to create block item');
                        return;
                    }

                    this.lastRenderedItem = blockItem;  // Next item goes after this block

                    // Set language
                    const normalizedLang = self.normalizeLanguage(lang);
                    try {
                        blockItem.setHighlightLanguage?.(normalizedLang);
                    } catch (e) {
                        console.log('[Renderer] Could not set language:', e.message);
                    }
                    blockItem.setSegments([]);

                    console.log('[Renderer] Block created:', blockItem.guid);

                    // Add each line as child
                    let lastLine = null;
                    for (const codeLine of lines) {
                        const lineItem = await this.record.createLineItem(
                            blockItem, lastLine, 'text'
                        );
                        if (lineItem) {
                            lineItem.setSegments([{ type: 'text', text: codeLine }]);
                            lastLine = lineItem;
                        }
                    }

                    this.renderedCount++;
                    console.log('[Renderer] Code block rendered #' + this.renderedCount);
                } catch (e) {
                    console.error('[Renderer] Failed to create block:', e);
                }
            },

            updatePreview() {
                if (!this.previewChild) return;

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
            },

            async finalize() {
                console.log('[Renderer] Finalizing...');

                // Render any remaining buffer
                if (this.buffer.trim()) {
                    if (this.inCodeBlock) {
                        // Unclosed code block - render what we have
                        console.log('[Renderer] Rendering unclosed code block');
                        await this.renderCodeBlock(this.codeBlockLang, this.buffer);
                    } else {
                        console.log('[Renderer] Rendering remaining buffer:', this.buffer);
                        await this.renderLine(this.buffer);
                    }
                }

                // Show complete message
                this.previewItem?.setSegments([
                    { type: 'text', text: '✓ Complete' }
                ]);

                // Wait a moment then clear the preview entirely
                await self.sleep(1000);
                this.previewItem?.setSegments([]);

                console.log('[Renderer] Finalized. Total rendered:', this.renderedCount);
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
