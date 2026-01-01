/**
 * Progressive Markdown Test Plugin
 *
 * Test harness for progressive markdown rendering.
 * - Streaming: Simulates LLM-style character-by-character streaming
 * - Instant: Fast paste with promise chaining
 * - Lean: Minimal paste function for SyncHub integration
 */

// Config
const BLANK_LINE_BEFORE_HEADINGS = true;

class Plugin extends AppPlugin {

    async onLoad() {
        console.log('[ProgTest] Loading progressive markdown test plugin');

        this.cmdStreaming = this.ui.addCommandPaletteCommand({
            label: 'Paste Markdown (Streaming)',
            icon: 'flask',
            onSelected: () => this.runStreaming(),
        });

        this.cmdInstant = this.ui.addCommandPaletteCommand({
            label: 'Paste Markdown (Instant)',
            icon: 'bolt',
            onSelected: () => this.runInstant(),
        });

        this.cmdLean = this.ui.addCommandPaletteCommand({
            label: 'Paste Markdown (Lean)',
            icon: 'rocket',
            onSelected: () => this.runLean(),
        });

        console.log('[ProgTest] Ready');
    }

    onUnload() {
        this.cmdStreaming?.remove();
        this.cmdInstant?.remove();
        this.cmdLean?.remove();
    }

    // =========================================================================
    // Common Helpers
    // =========================================================================

    getActiveRecord() {
        return this.ui.getActivePanel()?.getActiveRecord();
    }

    async getClipboardText() {
        try {
            const text = await navigator.clipboard.readText();
            return text?.trim() ? text : null;
        } catch (e) {
            return null;
        }
    }

    showError(message) {
        this.ui.addToaster({ title: 'Paste MD', message, dismissible: true });
    }

    // Delegates to SyncHub - no fallback needed
    parseInline(text) {
        return window.syncHub.parseInlineFormatting(text);
    }

    parseLineFast(line) {
        // Heading (returns level for setHeadingSize)
        const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
            return {
                type: 'heading',
                level: hMatch[1].length,
                segments: this.parseInline(hMatch[2])
            };
        }

        // Lists (handles indented items)
        const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
        if (ulMatch) return { type: 'ulist', segments: this.parseInline(ulMatch[2]) };

        const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
        if (olMatch) return { type: 'olist', segments: this.parseInline(olMatch[2]) };

        // Quote
        if (line.startsWith('> ')) return { type: 'quote', segments: this.parseInline(line.slice(2)) };

        // Text
        return { type: 'text', segments: this.parseInline(line) };
    }

    normalizeLanguage(lang) {
        if (!lang) return 'plaintext';
        const aliases = {
            'js': 'javascript', 'ts': 'typescript', 'py': 'python',
            'rb': 'ruby', 'sh': 'bash', 'yml': 'yaml',
        };
        return aliases[lang.toLowerCase()] || lang.toLowerCase();
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // =========================================================================
    // Lean Paste - Minimal, for SyncHub integration
    // =========================================================================

    async runLean() {
        const record = this.getActiveRecord();
        if (!record) return this.showError('Open a page first');

        const text = await this.getClipboardText();
        if (!text) return this.showError('Clipboard empty');

        await this.pasteMarkdownFast(text, record, null);
    }

    async pasteMarkdownFast(text, record, afterItem) {
        const start = performance.now();
        let promise = Promise.resolve(afterItem);
        let rendered = 0, errors = 0;
        let inCode = false, codeLang = '', codeLines = [];
        let isFirstBlock = true;
        const self = this;

        for (const line of text.split('\n')) {
            // Code fence (handles indented fences)
            const fenceMatch = line.match(/^(\s*)```(.*)$/);
            if (fenceMatch) {
                if (inCode) {
                    const lang = codeLang, code = [...codeLines];
                    promise = promise.then(async (last) => {
                        const block = await record.createLineItem(null, last, 'block');
                        if (!block) { errors++; return last; }
                        try { block.setHighlightLanguage?.(self.normalizeLanguage(lang)); } catch(e) {}
                        block.setSegments([]);
                        let prev = null;
                        for (const cl of code) {
                            const li = await record.createLineItem(block, prev, 'text');
                            if (li) { li.setSegments([{type:'text',text:cl}]); prev = li; }
                        }
                        rendered++;
                        return block;
                    });
                    isFirstBlock = false;
                    inCode = false; codeLang = ''; codeLines = [];
                } else {
                    inCode = true;
                    codeLang = fenceMatch[2].trim();
                }
                continue;
            }

            if (inCode) { codeLines.push(line); continue; }
            if (!line.trim()) continue;

            const parsed = this.parseLineFast(line);
            const { type, segments, level } = parsed;
            const isHeading = type === 'heading';
            const needsBlankLine = BLANK_LINE_BEFORE_HEADINGS && isHeading && !isFirstBlock;

            promise = promise.then(async (last) => {
                let insertAfter = last;

                // Add blank line before headings (except first block)
                if (needsBlankLine) {
                    const blank = await record.createLineItem(null, insertAfter, 'text');
                    if (blank) {
                        blank.setSegments([]);
                        insertAfter = blank;
                    }
                }

                const item = await record.createLineItem(null, insertAfter, type);
                if (!item) { errors++; return last; }

                // Set heading size for h2-h6
                if (isHeading && level > 1) {
                    try { item.setHeadingSize?.(level); } catch(e) {}
                }

                item.setSegments(segments);
                rendered++;
                return item;
            });

            isFirstBlock = false;
        }

        await promise;
        console.log(`[PasteMD] ${rendered} items in ${Math.round(performance.now() - start)}ms`);
        return { rendered, errors };
    }

    // =========================================================================
    // Instant Paste - Same as lean but with test harness
    // =========================================================================

    async runInstant() {
        const record = this.getActiveRecord();
        if (!record) return this.showError('Open a page first');

        const text = await this.getClipboardText();
        if (!text) return this.showError('Clipboard empty');

        console.log('[ProgTest] Instant paste:', text.length, 'chars');
        const start = performance.now();

        const labelItem = await record.createLineItem(null, null, 'text');
        labelItem?.setSegments([{ type: 'bold', text: 'Test (Instant):' }]);

        const result = await this.pasteMarkdownFast(text, record, labelItem);
        console.log(`[ProgTest] Complete in ${Math.round(performance.now() - start)}ms:`, result);
    }

    // =========================================================================
    // Streaming Paste - Character-by-character with preview
    // =========================================================================

    async runStreaming() {
        const record = this.getActiveRecord();
        if (!record) return this.showError('Open a page first');

        const text = await this.getClipboardText();
        if (!text) return this.showError('Clipboard empty');

        console.log('[ProgTest] Streaming paste:', text.length, 'chars');
        const start = performance.now();

        const labelItem = await record.createLineItem(null, null, 'text');
        labelItem?.setSegments([{ type: 'bold', text: 'Test (Streaming):' }]);

        const renderer = this.createStreamingRenderer(record, labelItem);
        await renderer.init();

        // Simulate streaming
        let streamed = '';
        const chunkSizes = [1, 2, 3, 5, 8];
        let chunkIndex = 0;

        for (let i = 0; i < text.length; ) {
            const chunkSize = chunkSizes[chunkIndex++ % chunkSizes.length];
            streamed += text.slice(i, i + chunkSize);
            i += chunkSize;
            renderer.update(streamed);
            await this.sleep(20 + Math.random() * 60);
        }

        const result = await renderer.finalize();
        console.log(`[ProgTest] Complete in ${Math.round(performance.now() - start)}ms:`, result);
    }

    createStreamingRenderer(record, labelItem) {
        const self = this;

        return {
            record, labelItem,
            previewItem: null,
            processedLength: 0,
            buffer: '',
            inCodeBlock: false,
            codeBlockLang: '',
            renderedCount: 0,
            errorCount: 0,
            lastItemPromise: null,

            async init() {
                this.lastItemPromise = Promise.resolve(this.labelItem);
                this.previewItem = await this.record.createLineItem(null, this.labelItem, 'text');
            },

            update(fullText) {
                const newText = fullText.slice(this.processedLength);
                if (!newText) return;

                for (const char of newText) {
                    this.buffer += char;
                    this.processedLength++;

                    if (this.inCodeBlock) {
                        if (this.buffer.endsWith('\n```\n') ||
                            (this.buffer.endsWith('\n```') && fullText.length === this.processedLength)) {
                            const endMarker = this.buffer.endsWith('\n```\n') ? '\n```\n' : '\n```';
                            this.renderCodeBlock(this.codeBlockLang, this.buffer.slice(0, -endMarker.length));
                            this.buffer = '';
                            this.inCodeBlock = false;
                            this.codeBlockLang = '';
                        }
                    } else if (char === '\n') {
                        const line = this.buffer.slice(0, -1);
                        const fenceMatch = line.match(/^(\s*)```(.*)$/);

                        if (fenceMatch) {
                            this.inCodeBlock = true;
                            this.codeBlockLang = fenceMatch[2].trim();
                            this.buffer = '';
                        } else if (line.trim()) {
                            this.renderLine(line);
                            this.buffer = '';
                        } else {
                            this.buffer = '';
                        }
                    }

                    this.updatePreview();
                }
            },

            renderLine(line) {
                const { type, segments } = self.parseLineFast(line);
                if (!segments?.length) return;

                const renderer = this;
                this.lastItemPromise = this.lastItemPromise.then(async (lastItem) => {
                    try {
                        const item = await renderer.record.createLineItem(null, lastItem, type);
                        if (item) {
                            item.setSegments(segments);
                            renderer.renderedCount++;
                            return item;
                        }
                        renderer.errorCount++;
                        return lastItem;
                    } catch (e) {
                        renderer.errorCount++;
                        return lastItem;
                    }
                });
            },

            renderCodeBlock(lang, content) {
                const lines = content.split('\n');
                const renderer = this;

                this.lastItemPromise = this.lastItemPromise.then(async (lastItem) => {
                    try {
                        const block = await renderer.record.createLineItem(null, lastItem, 'block');
                        if (!block) { renderer.errorCount++; return lastItem; }

                        try { block.setHighlightLanguage?.(self.normalizeLanguage(lang)); } catch(e) {}
                        block.setSegments([]);

                        let prev = null;
                        for (const codeLine of lines) {
                            const li = await renderer.record.createLineItem(block, prev, 'text');
                            if (li) { li.setSegments([{ type: 'text', text: codeLine }]); prev = li; }
                        }

                        renderer.renderedCount++;
                        return block;
                    } catch (e) {
                        renderer.errorCount++;
                        return lastItem;
                    }
                });
            },

            updatePreview() {
                if (!this.previewItem) return;
                try {
                    const display = this.buffer || '';
                    this.previewItem.setSegments([
                        ...(display ? [{ type: this.inCodeBlock ? 'code' : 'text', text: display }] : []),
                        { type: 'code', text: '█' }
                    ]);
                } catch (e) {}
            },

            async finalize() {
                if (this.buffer.trim()) {
                    if (this.inCodeBlock) {
                        this.renderCodeBlock(this.codeBlockLang, this.buffer);
                    } else {
                        this.renderLine(this.buffer);
                    }
                }

                await this.lastItemPromise;

                try {
                    this.previewItem?.setSegments([
                        { type: 'text', text: this.errorCount > 0 ? `Done (${this.errorCount} errors)` : 'Done' }
                    ]);
                    await self.sleep(1000);
                    this.previewItem?.setSegments([]);
                } catch (e) {}

                return { rendered: this.renderedCount, errors: this.errorCount };
            },
        };
    }
}
