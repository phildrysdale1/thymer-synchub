/**
 * Sync Hub - Plugin Orchestrator
 *
 * Exposes window.syncHub API for self-syncing collections to register.
 * Manages scheduling, status tracking, and activity logging.
 *
 * Architecture: Collections All The Way Down
 * - Each plugin has one record in this collection (singleton)
 * - Record contains: settings + status + activity log (in body)
 * - State stored in Thymer, not IndexedDB
 */

class Plugin extends CollectionPlugin {

    async onLoad() {
        this.log('Sync Hub v0.1 loading...');

        // Find our collection
        const collections = await this.data.getAllCollections();
        this.myCollection = collections.find(c => c.getName() === this.getName());

        if (!this.myCollection) {
            this.log('Could not find own collection!', 'error');
            return;
        }

        this.log(`Found collection: ${this.myCollection.getName()} (${this.myCollection.getGuid()})`);

        // Expose API for other collections to register
        window.syncHub = {
            register: (config) => this.registerPlugin(config),
            unregister: (pluginId) => this.unregisterPlugin(pluginId),
            requestSync: (pluginId) => this.requestSync(pluginId),
            getStatus: (pluginId) => this.getPluginStatus(pluginId),
            // Markdown utilities
            insertMarkdown: (markdown, record, parentItem) => this.insertMarkdown(markdown, record, parentItem),
            parseMarkdown: (markdown) => this.parseMarkdown(markdown),
        };

        // Track registered sync functions
        this.syncFunctions = new Map();

        // Start the scheduler
        this.startScheduler();

        this.log('Sync Hub ready. window.syncHub API exposed.');
    }

    onUnload() {
        this.stopScheduler();
        delete window.syncHub;
        this.log('Sync Hub unloaded.');
    }

    // =========================================================================
    // Plugin Registration API
    // =========================================================================

    /**
     * Register a sync plugin
     * @param {Object} config
     * @param {string} config.id - Unique plugin ID (e.g., 'github-sync')
     * @param {string} config.name - Display name
     * @param {string} config.icon - Icon class (e.g., 'ti-brand-github')
     * @param {Function} config.sync - Async function to perform sync
     * @param {string} config.defaultInterval - Default interval (e.g., '5m', '1h')
     */
    async registerPlugin(config) {
        const { id, name, icon, sync, defaultInterval = '5m' } = config;

        if (!id || !sync) {
            this.log(`Registration failed: missing id or sync function`, 'error');
            return null;
        }

        // Store the sync function
        this.syncFunctions.set(id, sync);

        // Find or create the plugin record
        let record = await this.findPluginRecord(id);

        if (!record) {
            record = await this.createPluginRecord({
                id,
                name,
                icon,
                defaultInterval,
            });
            this.log(`Registered new plugin: ${id}`);
        } else {
            this.log(`Plugin already registered: ${id}`);
        }

        return record;
    }

    async unregisterPlugin(pluginId) {
        this.syncFunctions.delete(pluginId);
        this.log(`Unregistered plugin: ${pluginId}`);
    }

    // =========================================================================
    // Record Management
    // =========================================================================

    async findPluginRecord(pluginId) {
        const records = await this.myCollection.getAllRecords();
        return records.find(r => r.text('plugin_id') === pluginId);
    }

    async createPluginRecord({ id, name, icon, defaultInterval }) {
        // Create a new record in this collection
        const recordGuid = this.myCollection.createRecord(name || id);
        if (!recordGuid) {
            this.log(`Failed to create record for plugin: ${id}`, 'error');
            return null;
        }

        const record = this.data.getRecord(recordGuid);
        if (!record) {
            this.log(`Could not find created record: ${recordGuid}`, 'error');
            return null;
        }

        // Set the fields
        record.prop('plugin_id')?.set(id);
        record.prop('enabled')?.setChoice('yes');
        record.prop('status')?.setChoice('idle');
        record.prop('interval')?.setChoice(defaultInterval || '5m');
        record.prop('journal')?.setChoice('yes');
        record.prop('toast')?.setChoice('new_records');
        record.prop('log_level')?.setChoice('info');

        // Set initial activity log
        await this.appendLog(record.guid, `Plugin registered: ${name || id}`);

        return record;
    }

    async getPluginStatus(pluginId) {
        const record = await this.findPluginRecord(pluginId);
        if (!record) return null;

        return {
            enabled: record.prop('enabled')?.value,
            status: record.prop('status')?.choice(),
            lastRun: record.prop('last_run')?.date(),
            lastError: record.prop('last_error')?.text(),
            interval: record.prop('interval')?.text(),
        };
    }

    // =========================================================================
    // Scheduling
    // =========================================================================

    startScheduler() {
        // Check every 30 seconds which plugins need to run
        this.schedulerInterval = setInterval(() => this.tick(), 30000);
        this.log('Scheduler started (30s tick)');
    }

    stopScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
        this.log('Scheduler stopped');
    }

    async tick() {
        if (!this.myCollection) return;

        const records = await this.myCollection.getAllRecords();
        const now = Date.now();

        for (const record of records) {
            const pluginId = record.text('plugin_id');
            if (!pluginId) continue;

            const enabled = record.prop('enabled')?.choice();
            const status = record.prop('status')?.choice();
            const interval = record.prop('interval')?.choice();
            const lastRun = record.prop('last_run')?.date();

            if (enabled !== 'yes' || status === 'syncing' || interval === 'manual') continue;

            const intervalMs = this.parseInterval(interval);
            const lastRunMs = lastRun ? lastRun.getTime() : 0;

            if (now - lastRunMs >= intervalMs) {
                this.runSync(pluginId, record);
            }
        }
    }

    parseInterval(interval) {
        if (!interval) return 5 * 60 * 1000; // default 5m

        const match = interval.match(/^(\d+)(s|m|h|d)?$/);
        if (!match) return 5 * 60 * 1000;

        const value = parseInt(match[1], 10);
        const unit = match[2] || 'm';

        const multipliers = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
        };

        return value * (multipliers[unit] || 60000);
    }

    // =========================================================================
    // Sync Execution
    // =========================================================================

    async requestSync(pluginId) {
        const record = await this.findPluginRecord(pluginId);
        if (!record) {
            this.log(`Cannot sync unknown plugin: ${pluginId}`, 'error');
            return;
        }
        await this.runSync(pluginId, record);
    }

    async runSync(pluginId, record) {
        const syncFn = this.syncFunctions.get(pluginId);
        if (!syncFn) {
            this.log(`No sync function for: ${pluginId}`, 'warn');
            return;
        }

        const logLevel = record.prop('log_level')?.choice() || 'info';
        const toastLevel = record.prop('toast')?.choice() || 'new_records';
        const writeJournal = record.prop('journal')?.choice() === 'yes';

        // Update status to syncing
        record.prop('status')?.setChoice('syncing');

        if (logLevel === 'debug') {
            this.log(`Starting sync: ${pluginId}`);
        }

        try {
            const startTime = Date.now();

            // Run the sync function with context
            const result = await syncFn({
                data: this.data,
                ui: this.ui,
                log: (msg) => this.appendLog(record.guid, msg),
                debug: (msg) => {
                    if (logLevel === 'debug') {
                        this.appendLog(record.guid, `[debug] ${msg}`);
                    }
                },
            });

            const duration = Date.now() - startTime;

            // Update status to idle
            record.prop('status')?.setChoice('idle');
            record.prop('last_run')?.set(new Date());
            record.prop('last_error')?.set(null);

            // Log result
            const summary = result?.summary || 'Sync complete';
            await this.appendLog(record.guid, `${summary} (${duration}ms)`);

            // Toast notification
            if (this.shouldToast(toastLevel, result)) {
                this.ui.addToaster({
                    title: pluginId,
                    message: summary,
                    dismissible: true,
                    autoDestroyTime: 3000,
                });
            }

            // Journal entry
            if (writeJournal && result?.journalEntry) {
                // TODO: Write to daily journal
                this.log(`Journal: ${result.journalEntry}`);
            }

        } catch (error) {
            const errorMsg = error.message || String(error);

            record.prop('status')?.setChoice('error');
            record.prop('last_run')?.set(new Date());
            record.prop('last_error')?.set(errorMsg);

            await this.appendLog(record.guid, `ERROR: ${errorMsg}`);

            // Always toast on error if not 'none'
            if (toastLevel !== 'none') {
                this.ui.addToaster({
                    title: `${pluginId} error`,
                    message: errorMsg,
                    dismissible: true,
                    autoDestroyTime: 5000,
                });
            }

            this.log(`Sync failed for ${pluginId}: ${errorMsg}`, 'error');
        }
    }

    shouldToast(level, result) {
        if (level === 'none') return false;
        if (level === 'all_updates') return true;
        if (level === 'new_records') return result?.created > 0;
        if (level === 'errors_only') return false; // errors handled separately
        return false;
    }

    // =========================================================================
    // Activity Logging
    // =========================================================================

    async appendLog(recordGuid, message) {
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        const logLine = `${timestamp} ${message}`;

        // Get the record
        const record = this.data.getRecord(recordGuid);
        if (!record) {
            this.log(`Could not find record for logging: ${recordGuid}`, 'warn');
            return;
        }

        // Get current body via line items and append
        // For now, just log to console - body manipulation via line items is more complex
        this.log(`[${recordGuid}] ${logLine}`);

        // TODO: Implement proper body appending via line items API
        // const lineItems = await record.getLineItems();
        // await record.createLineItem(null, lastItem, 'text');
    }

    log(message, level = 'info') {
        const prefix = '[SyncHub]';
        if (level === 'error') {
            console.error(prefix, message);
        } else if (level === 'warn') {
            console.warn(prefix, message);
        } else {
            console.log(prefix, message);
        }
    }

    // =========================================================================
    // Markdown Utilities (shared via window.syncHub)
    // =========================================================================

    async insertMarkdown(markdown, targetRecord, parentItem = null) {
        const record = targetRecord;

        if (!record) {
            this.log('insertMarkdown: No target record provided', 'error');
            return;
        }

        const blocks = this.parseMarkdown(markdown);

        // Find the last item to append after
        const existingItems = await record.getLineItems();
        const containerGuid = parentItem ? parentItem.guid : record.guid;
        const siblingItems = existingItems.filter(item => item.parent_guid === containerGuid);
        let lastItem = siblingItems.length > 0 ? siblingItems[siblingItems.length - 1] : null;

        // Hierarchical nesting based on heading levels
        let parentStack = [{ item: parentItem, afterItem: lastItem, level: 0 }];
        let isFirstBlock = true;

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const isHeading = block.type === 'heading';
            const headingLevel = isHeading ? (block.mp?.hsize || 1) : 0;

            try {
                let newItem;
                if (isHeading) {
                    // Pop stack back to parent level
                    while (parentStack.length > 1 && parentStack[parentStack.length - 1].level >= headingLevel) {
                        parentStack.pop();
                    }

                    const parent = parentStack[parentStack.length - 1];

                    // Add blank line before headings (except first block)
                    if (!isFirstBlock) {
                        const blankItem = await record.createLineItem(parent.item, parent.afterItem, 'text');
                        if (blankItem) {
                            blankItem.setSegments([]);
                            parent.afterItem = blankItem;
                        }
                    }

                    newItem = await record.createLineItem(parent.item, parent.afterItem, block.type);

                    if (newItem) {
                        parent.afterItem = newItem;
                        if (headingLevel > 1 && typeof newItem.setHeadingSize === 'function') {
                            try { newItem.setHeadingSize(headingLevel); } catch (e) {}
                        }
                        newItem.setSegments(block.segments || []);
                        parentStack.push({ item: newItem, afterItem: null, level: headingLevel });
                    }
                } else {
                    const parent = parentStack[parentStack.length - 1];
                    newItem = await record.createLineItem(parent.item, parent.afterItem, block.type);

                    if (newItem) {
                        parent.afterItem = newItem;
                    }
                }

                if (newItem) {
                    if (block.mp) {
                        newItem._item.mp = block.mp;
                    }

                    // For code blocks, create child text items for each line
                    if (block.type === 'block' && block.codeLines) {
                        const lang = this.normalizeLanguage(block.mp?.language);
                        if (lang && typeof newItem.setHighlightLanguage === 'function') {
                            try { newItem.setHighlightLanguage(lang); } catch (e) {}
                        }
                        newItem.setSegments([]);

                        let codeLastChild = null;
                        for (const line of block.codeLines) {
                            const childItem = await record.createLineItem(newItem, codeLastChild, 'text');
                            if (childItem) {
                                childItem.setSegments([{ type: 'text', text: line }]);
                                codeLastChild = childItem;
                            }
                        }
                    } else if (!isHeading && block.segments && block.segments.length > 0) {
                        newItem.setSegments(block.segments);
                    } else if (!isHeading && block.mp) {
                        newItem.setSegments([]);
                    }

                    isFirstBlock = false;
                }
            } catch (e) {
                console.error('Failed to create line item:', e);
            }
        }

        return blocks.length;
    }

    parseMarkdown(markdown) {
        const lines = markdown.split('\n');
        const blocks = [];
        let inCodeBlock = false;
        let codeLines = [];
        let codeLanguage = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    codeLanguage = line.slice(3).trim();
                    codeLines = [];
                } else {
                    inCodeBlock = false;
                    if (codeLines.length > 0) {
                        blocks.push({
                            type: 'block',
                            mp: { language: codeLanguage || 'plaintext' },
                            codeLines: codeLines
                        });
                    }
                    codeLines = [];
                    codeLanguage = '';
                }
                continue;
            }

            if (inCodeBlock) {
                codeLines.push(line);
                continue;
            }

            const parsed = this.parseLine(line);
            if (parsed) {
                blocks.push(parsed);
            }
        }

        // Handle unclosed code block
        if (inCodeBlock && codeLines.length > 0) {
            blocks.push({
                type: 'block',
                mp: { language: codeLanguage || 'plaintext' },
                codeLines: codeLines
            });
        }

        return blocks;
    }

    parseLine(line) {
        if (!line.trim()) {
            return null;
        }

        // Horizontal rule
        if (/^(\*\s*\*\s*\*|\-\s*\-\s*\-|_\s*_\s*_)[\s\*\-_]*$/.test(line.trim())) {
            return { type: 'br', segments: [] };
        }

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            return {
                type: 'heading',
                mp: { hsize: level },
                segments: this.parseInlineFormatting(headingMatch[2])
            };
        }

        // Task list
        const taskMatch = line.match(/^[\-\*]\s+\[([ xX])\]\s+(.+)$/);
        if (taskMatch) {
            return { type: 'task', segments: this.parseInlineFormatting(taskMatch[2]) };
        }

        // Unordered list
        const ulMatch = line.match(/^[\-\*]\s+(.+)$/);
        if (ulMatch) {
            return { type: 'ulist', segments: this.parseInlineFormatting(ulMatch[1]) };
        }

        // Ordered list
        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            return { type: 'olist', segments: this.parseInlineFormatting(olMatch[1]) };
        }

        // Quote
        if (line.startsWith('> ')) {
            return { type: 'quote', segments: this.parseInlineFormatting(line.slice(2)) };
        }

        // Regular text
        return { type: 'text', segments: this.parseInlineFormatting(line) };
    }

    parseInlineFormatting(text) {
        const segments = [];
        const patterns = [
            { regex: /`([^`]+)`/, type: 'code' },
            { regex: /\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
            { regex: /\*\*([^*]+)\*\*/, type: 'bold' },
            { regex: /__([^_]+)__/, type: 'bold' },
            { regex: /\*([^*]+)\*/, type: 'italic' },
            { regex: /(?:^|[^a-zA-Z])_([^_]+)_(?:$|[^a-zA-Z])/, type: 'italic' },
        ];

        let remaining = text;

        while (remaining.length > 0) {
            let earliestMatch = null;
            let earliestIndex = remaining.length;
            let matchedPattern = null;

            for (const pattern of patterns) {
                const match = remaining.match(pattern.regex);
                if (match && match.index < earliestIndex) {
                    earliestMatch = match;
                    earliestIndex = match.index;
                    matchedPattern = pattern;
                }
            }

            if (earliestMatch && matchedPattern) {
                if (earliestIndex > 0) {
                    segments.push({ type: 'text', text: remaining.slice(0, earliestIndex) });
                }

                if (matchedPattern.type === 'link') {
                    segments.push({ type: 'text', text: earliestMatch[1] });
                } else {
                    segments.push({ type: matchedPattern.type, text: earliestMatch[1] });
                }

                remaining = remaining.slice(earliestIndex + earliestMatch[0].length);
            } else {
                segments.push({ type: 'text', text: remaining });
                break;
            }
        }

        return segments.length ? segments : [{ type: 'text', text }];
    }

    normalizeLanguage(lang) {
        if (!lang) return 'plaintext';
        const lower = lang.toLowerCase();
        const LANGUAGE_ALIASES = {
            'js': 'javascript', 'ts': 'typescript', 'py': 'python',
            'rb': 'ruby', 'sh': 'bash', 'yml': 'yaml', 'c++': 'cpp',
            'c#': 'csharp', 'cs': 'csharp', 'golang': 'go', 'rs': 'rust',
            'kt': 'kotlin', 'md': 'markdown', 'html': 'xml', 'htm': 'xml'
        };
        return LANGUAGE_ALIASES[lower] || lower;
    }
}
