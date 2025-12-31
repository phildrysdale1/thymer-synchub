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
        // Find our collection
        const collections = await this.data.getAllCollections();
        this.myCollection = collections.find(c => c.getName() === this.getName());

        if (!this.myCollection) {
            this.log('Could not find own collection!', 'error');
            return;
        }

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

        // Track registered sync functions (MUST be before event dispatch!)
        this.syncFunctions = new Map();

        // Dispatch event so plugins can (re)register
        console.log('[SyncHub] Ready, dispatching synchub-ready event');
        window.dispatchEvent(new CustomEvent('synchub-ready'));

        // Track currently syncing plugin for status bar
        this.currentlySyncing = null;

        // Status bar item
        this.statusBarItem = this.ui.addStatusBarItem({
            htmlLabel: this.buildStatusLabel('idle'),
            tooltip: 'Sync Hub - Initializing...',
            onClick: () => this.onStatusBarClick()
        });

        // Command palette: Paste Markdown
        this.pasteCommand = this.ui.addCommandPaletteCommand({
            label: 'Paste Markdown',
            icon: 'clipboard-text',
            onSelected: () => this.pasteMarkdownFromClipboard()
        });

        // Command palette: Sync All
        this.syncAllCommand = this.ui.addCommandPaletteCommand({
            label: 'Sync Hub: Sync All',
            icon: 'refresh',
            onSelected: () => this.syncAll()
        });

        // Command palette: Reset Stuck Syncs
        this.resetCommand = this.ui.addCommandPaletteCommand({
            label: 'Sync Hub: Reset Stuck Syncs',
            icon: 'refresh-alert',
            onSelected: () => this.resetStuckSyncs()
        });

        // Start the scheduler
        this.startScheduler();

        // Initial status update
        setTimeout(() => this.updateStatusBar(), 500);

        // Periodic status bar refresh (every 30s to update relative times)
        this.statusBarRefreshInterval = setInterval(() => this.updateStatusBar(), 30000);
    }

    onUnload() {
        if (this.pasteCommand) {
            this.pasteCommand.remove();
        }
        if (this.syncAllCommand) {
            this.syncAllCommand.remove();
        }
        if (this.resetCommand) {
            this.resetCommand.remove();
        }
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
        if (this.statusBarRefreshInterval) {
            clearInterval(this.statusBarRefreshInterval);
        }
        this.stopScheduler();
        delete window.syncHub;
    }

    async pasteMarkdownFromClipboard() {
        try {
            const markdown = await navigator.clipboard.readText();
            if (!markdown || !markdown.trim()) {
                this.ui.addToaster({
                    title: 'Paste Markdown',
                    message: 'Clipboard is empty',
                    dismissible: true,
                    autoDestroyTime: 2000,
                });
                return;
            }

            const record = this.ui.getActivePanel()?.getActiveRecord();
            if (!record) {
                this.ui.addToaster({
                    title: 'Paste Markdown',
                    message: 'No active record. Open a note first.',
                    dismissible: true,
                    autoDestroyTime: 3000,
                });
                return;
            }

            await this.insertMarkdown(markdown, record, null);
        } catch (error) {
            this.ui.addToaster({
                title: 'Paste Markdown',
                message: `Failed: ${error.message}`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }
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
        console.log(`[SyncHub] Registered plugin: ${id} (${this.syncFunctions.size} total)`);

        // Find or create the plugin record
        let record = await this.findPluginRecord(id);

        if (!record) {
            record = await this.createPluginRecord({
                id,
                name,
                icon,
                defaultInterval,
            });
        }

        return record;
    }

    async unregisterPlugin(pluginId) {
        this.syncFunctions.delete(pluginId);
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

        // Wait for record to sync (SDK quirk - getRecord returns null immediately)
        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await this.myCollection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) {
            this.log(`Could not find created record: ${recordGuid}`, 'error');
            return null;
        }

        // Set the fields
        record.prop('plugin_id')?.set(id);
        record.prop('enabled')?.setChoice('yes');
        record.prop('status')?.setChoice('idle');
        record.prop('interval')?.setChoice(defaultInterval || '5m');
        record.prop('journal')?.setChoice('major_only');
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
    }

    stopScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
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
        const journalLevel = record.prop('journal')?.choice() || 'none';

        // Update status to syncing
        record.prop('status')?.setChoice('syncing');
        this.currentlySyncing = pluginId;
        this.updateStatusBar();

        const startTime = Date.now();
        let result = null;
        let errorMsg = null;

        try {
            // Run sync with timeout (5 minutes max)
            const SYNC_TIMEOUT = 5 * 60 * 1000;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Sync timeout (5 min)')), SYNC_TIMEOUT);
            });

            const syncPromise = syncFn({
                data: this.data,
                ui: this.ui,
                log: (msg) => this.appendLog(record.guid, msg, logLevel),
                debug: (msg) => {
                    if (logLevel === 'debug') {
                        this.appendLog(record.guid, `[debug] ${msg}`, logLevel);
                    }
                },
            });

            result = await Promise.race([syncPromise, timeoutPromise]);

        } catch (error) {
            errorMsg = error.message || String(error);
        } finally {
            // ALWAYS reset status - this is the key fix
            const duration = Date.now() - startTime;
            this.currentlySyncing = null;

            if (errorMsg) {
                record.prop('status')?.setChoice('error');
                record.prop('last_error')?.set(errorMsg);
                await this.appendLog(record.guid, `ERROR: ${errorMsg}`, 'error');

                if (toastLevel !== 'none') {
                    this.ui.addToaster({
                        title: `${pluginId} error`,
                        message: errorMsg,
                        dismissible: true,
                        autoDestroyTime: 5000,
                    });
                }
            } else {
                record.prop('status')?.setChoice('idle');
                record.prop('last_error')?.set(null);

                // Log changes
                const changes = result?.changes || [];
                for (const change of changes) {
                    await this.appendChangeLog(record.guid, change.verb, change.title, change.guid);
                }

                // At debug level: always log summary with duration
                // At info level: only log if we have changes (changes already logged above)
                if (logLevel === 'debug') {
                    const summary = result?.summary || 'Sync complete';
                    await this.appendLog(record.guid, `${summary} (${duration}ms)`, logLevel);
                }

                if (this.shouldToast(toastLevel, result)) {
                    this.ui.addToaster({
                        title: pluginId,
                        message: result?.summary || 'Sync complete',
                        dismissible: true,
                        autoDestroyTime: 3000,
                    });
                }

                if (journalLevel !== 'none' && (result?.changes?.length || 0) > 0) {
                    await this.writeChangesToJournal(result.changes, journalLevel);
                }
            }

            this.setLastRun(record);
            this.updateStatusBar();
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

    async appendChangeLog(syncHubRecordGuid, verb, title, targetRecordGuid) {
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        // Append to Sync Hub record body with verb + record reference
        try {
            const record = this.data.getRecord(syncHubRecordGuid);
            if (!record) return;

            // Find the last top-level line item
            const existingItems = await record.getLineItems();
            const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
            const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

            // Create new line item: **15:21** opened [[Record Title]]
            const newItem = await record.createLineItem(null, lastItem, 'text');
            if (newItem) {
                newItem.setSegments([
                    { type: 'bold', text: timestamp },
                    { type: 'text', text: ` ${verb} ` },
                    { type: 'ref', text: { guid: targetRecordGuid } }
                ]);
            }
        } catch (e) {
            // Silently fail - logging shouldn't break sync
        }
    }

    async appendLog(recordGuid, message, logLevel = 'info') {
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        const logLine = `${timestamp} ${message}`;

        // Only log to console in debug mode or for errors
        if (logLevel === 'debug' || logLevel === 'error') {
            console.log(`[SyncHub] [${recordGuid.slice(0,8)}] ${logLine}`);
        }

        // Append to record body with rich formatting
        try {
            const record = this.data.getRecord(recordGuid);
            if (!record) return;

            // Find the last top-level line item
            const existingItems = await record.getLineItems();
            const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
            const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

            // Create new line item after the last one
            const newItem = await record.createLineItem(null, lastItem, 'text');
            if (newItem) {
                newItem.setSegments([
                    { type: 'bold', text: timestamp },
                    { type: 'text', text: ` ${message}` }
                ]);
            }
        } catch (e) {
            // Silently fail - logging shouldn't break sync
        }
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
    // Journal Integration
    // =========================================================================

    async getTodayJournalRecord() {
        try {
            const collections = await this.data.getAllCollections();
            const journalCollection = collections.find(c => c.getName() === 'Journal');
            if (!journalCollection) return null;

            // Journal guids end with the date in YYYYMMDD format
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // "20251231"

            const records = await journalCollection.getAllRecords();
            const todayRecord = records.find(r => r.guid.endsWith(today));

            return todayRecord || null;
        } catch (e) {
            return null;
        }
    }

    async writeChangesToJournal(changes, level) {
        const journalRecord = await this.getTodayJournalRecord();
        if (!journalRecord) return;

        // Filter changes based on level
        const filteredChanges = level === 'major_only'
            ? changes.filter(c => c.major)
            : changes;

        if (filteredChanges.length === 0) return;

        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        try {
            // Find the last top-level line item
            const existingItems = await journalRecord.getLineItems();
            const topLevelItems = existingItems.filter(item => item.parent_guid === journalRecord.guid);
            let lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

            for (const change of filteredChanges) {
                // Create parent line: **15:21** highlighted [[Record Title]]
                const parentItem = await journalRecord.createLineItem(null, lastItem, 'text');
                if (parentItem) {
                    parentItem.setSegments([
                        { type: 'bold', text: timestamp },
                        { type: 'text', text: ` ${change.verb} ` },
                        { type: 'ref', text: { guid: change.guid } }
                    ]);
                    lastItem = parentItem;

                    // For verbose mode, add children as nested items
                    if (level === 'verbose' && change.children && change.children.length > 0) {
                        let childLastItem = null;
                        for (const childText of change.children) {
                            // Truncate long highlights
                            const truncated = childText.length > 100
                                ? childText.slice(0, 100) + '...'
                                : childText;

                            const childItem = await journalRecord.createLineItem(parentItem, childLastItem, 'quote');
                            if (childItem) {
                                childItem.setSegments([{ type: 'text', text: truncated }]);
                                childLastItem = childItem;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Silently fail - journal shouldn't break sync
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

    /**
     * Set last_run datetime field using Thymer's DateTime class
     */
    setLastRun(record) {
        const prop = record.prop('last_run');
        if (!prop) return;

        const now = new Date();

        // Use DateTime class if available (Thymer global)
        if (typeof DateTime !== 'undefined') {
            const dt = new DateTime(now);
            prop.set(dt.value());
        } else {
            // Fallback to plain Date
            prop.set(now);
        }
    }

    // =========================================================================
    // Status Bar
    // =========================================================================

    /**
     * Build HTML label for status bar
     */
    buildStatusLabel(state, extra = '') {
        const icon = '↻'; // sync icon
        let indicator;

        switch (state) {
            case 'syncing':
                // Spinning animation via CSS
                indicator = '<span style="display: inline-block; animation: spin 1s linear infinite; color: #60a5fa;">↻</span>';
                break;
            case 'error':
                indicator = '<span style="color: #f87171;">●</span>';
                break;
            case 'idle':
                indicator = '<span style="color: #4ade80;">●</span>';
                break;
            case 'disabled':
                indicator = '<span style="opacity: 0.4;">○</span>';
                break;
            default:
                indicator = '<span style="opacity: 0.4;">...</span>';
        }

        // Add CSS for spin animation if not already present
        const style = state === 'syncing'
            ? '<style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>'
            : '';

        return `${style}<span style="font-size: 13px; opacity: 0.8;">⟳</span> ${indicator}${extra ? ' ' + extra : ''}`;
    }

    /**
     * Update status bar based on current sync state
     */
    async updateStatusBar() {
        if (!this.statusBarItem) return;

        try {
            const records = await this.myCollection?.getAllRecords() || [];
            console.log(`[SyncHub] updateStatusBar: ${records.length} records, syncing=${this.currentlySyncing}`);

            // Check if currently syncing
            if (this.currentlySyncing) {
                const name = this.getPluginName(this.currentlySyncing);
                this.statusBarItem.setHtmlLabel(this.buildStatusLabel('syncing'));
                this.statusBarItem.setTooltip(`Syncing ${name}...`);
                return;
            }

            // Check for errors
            const errorRecords = records.filter(r => {
                const enabled = r.prop('enabled')?.choice() === 'yes';
                const status = r.prop('status')?.choice();
                return enabled && status === 'error';
            });

            if (errorRecords.length > 0) {
                const names = errorRecords.map(r => this.getPluginName(r.text('plugin_id'))).join(', ');
                this.statusBarItem.setHtmlLabel(this.buildStatusLabel('error'));
                this.statusBarItem.setTooltip(`Sync errors: ${names}`);
                return;
            }

            // Check enabled plugins
            const enabledRecords = records.filter(r => r.prop('enabled')?.choice() === 'yes');

            if (enabledRecords.length === 0) {
                this.statusBarItem.setHtmlLabel(this.buildStatusLabel('disabled'));
                this.statusBarItem.setTooltip('Sync Hub - No syncs enabled');
                return;
            }

            // Find most recent last_run for relative time
            let latestRun = null;
            for (const r of enabledRecords) {
                const lastRun = r.prop('last_run')?.date();
                if (lastRun && (!latestRun || lastRun > latestRun)) {
                    latestRun = lastRun;
                }
            }

            const relativeTime = latestRun ? this.formatRelativeTime(latestRun) : 'never';
            this.statusBarItem.setHtmlLabel(this.buildStatusLabel('idle'));
            this.statusBarItem.setTooltip(`Sync Hub - Last sync: ${relativeTime} (${enabledRecords.length} active)`);

        } catch (e) {
            // Silently ignore errors during status update
        }
    }

    /**
     * Get friendly plugin name from ID
     */
    getPluginName(pluginId) {
        const names = {
            'github-sync': 'GitHub',
            'readwise-sync': 'Readwise',
            'google-calendar-sync': 'Calendar',
        };
        return names[pluginId] || pluginId;
    }

    /**
     * Format relative time (e.g., "5m ago", "2h ago")
     */
    formatRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    /**
     * Handle status bar click - open Sync Hub collection
     */
    onStatusBarClick() {
        // TODO: Open Sync Hub collection view
        // For now, trigger sync all
        this.syncAll();
    }

    /**
     * Sync all enabled plugins
     */
    async syncAll() {
        console.log('[SyncHub] syncAll triggered');
        try {
            const records = await this.myCollection?.getAllRecords() || [];
            const enabledRecords = records.filter(r => r.prop('enabled')?.choice() === 'yes');
            console.log(`[SyncHub] Found ${enabledRecords.length} enabled plugins`);

            if (enabledRecords.length === 0) {
                this.ui.addToaster({
                    title: 'Sync Hub',
                    message: 'No syncs enabled',
                    dismissible: true,
                    autoDestroyTime: 2000,
                });
                return;
            }

            this.ui.addToaster({
                title: 'Sync Hub',
                message: `Syncing ${enabledRecords.length} plugins...`,
                dismissible: true,
                autoDestroyTime: 2000,
            });

            for (const record of enabledRecords) {
                const pluginId = record.text('plugin_id');
                if (pluginId && this.syncFunctions.has(pluginId)) {
                    await this.runSync(pluginId, record);
                }
            }

        } catch (e) {
            this.ui.addToaster({
                title: 'Sync Hub',
                message: `Sync all failed: ${e.message}`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }
    }

    /**
     * Reset all stuck syncs to idle
     */
    async resetStuckSyncs() {
        try {
            const records = await this.myCollection?.getAllRecords() || [];
            let resetCount = 0;

            for (const record of records) {
                const status = record.prop('status')?.choice();
                if (status === 'syncing') {
                    record.prop('status')?.setChoice('idle');
                    record.prop('last_error')?.set('Reset by user');
                    resetCount++;
                }
            }

            this.currentlySyncing = null;
            this.updateStatusBar();

            this.ui.addToaster({
                title: 'Sync Hub',
                message: resetCount > 0 ? `Reset ${resetCount} stuck sync(s)` : 'No stuck syncs found',
                dismissible: true,
                autoDestroyTime: 2000,
            });

        } catch (e) {
            this.ui.addToaster({
                title: 'Sync Hub',
                message: `Reset failed: ${e.message}`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }
    }
}
