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

const VERSION = 'v1.2.0';

// Sync lock configuration (prevents duplicate syncs across multiple Thymer instances)
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes - stale lock threshold
const LOCK_SETTLE_MIN_MS = 100;          // Min wait for double-read pattern
const LOCK_SETTLE_JITTER_MS = 400;       // Random jitter to reduce race collisions

// Markdown config
const BLANK_LINE_BEFORE_HEADINGS = true;

// Dashboard CSS
const DASHBOARD_CSS = `
    .sync-dashboard {
        padding: 24px;
        font-family: var(--font-family);
    }
    .sync-dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
    }
    .sync-card {
        background: var(--bg-hover);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 20px;
        transition: all 0.2s ease;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .sync-card:hover {
        background: var(--bg-active, var(--bg-hover));
        border-color: rgba(255,255,255,0.2);
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        transform: translateY(-2px);
    }
    .sync-card[data-status="error"] {
        border-color: var(--enum-red-bg);
    }
    .sync-card[data-status="syncing"] {
        border-color: var(--enum-blue-bg);
    }
    .sync-card[data-enabled="no"] {
        opacity: 0.6;
        border-style: dashed;
    }
    .sync-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
    }
    .sync-card-icon {
        font-size: 20px;
        color: var(--text-muted);
    }
    .sync-card-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--text-default);
        flex: 1;
    }
    .sync-card-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--enum-green-bg);
    }
    .sync-card-dot.error {
        background: var(--enum-red-bg);
    }
    .sync-card-dot.stale {
        background: var(--enum-orange-bg);
    }
    .sync-card-dot.disabled {
        background: var(--text-muted);
    }
    .sync-card-dot.syncing {
        background: none;
        width: auto;
        height: auto;
    }
    .sync-card-dot.syncing .ti-blinking-dot {
        color: var(--enum-blue-fg);
        font-size: 20px;
    }
    .sync-card-body {
        text-align: center;
        padding: 8px 0;
    }
    .sync-card-value {
        font-size: 36px;
        font-weight: 700;
        color: var(--text-default);
        line-height: 1;
        margin-bottom: 4px;
    }
    .sync-card-label {
        font-size: 12px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .sync-card-footer {
        text-align: center;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border-default);
    }
    .sync-card-time {
        font-size: 12px;
        color: var(--text-muted);
    }
    .sync-card-error {
        font-size: 11px;
        color: var(--enum-red-fg);
        margin-top: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .sync-dashboard-summary {
        background: var(--bg-default);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        padding: 16px 24px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 24px;
        color: var(--text-muted);
        font-size: 14px;
    }
    .sync-summary-item {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .sync-summary-value {
        font-weight: 600;
        color: var(--text-default);
    }
    .sync-summary-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }
    .sync-summary-dot.healthy { background: var(--enum-green-bg); }
    .sync-summary-dot.warning { background: var(--enum-orange-bg); }
    .sync-summary-dot.error { background: var(--enum-red-bg); }
    .sync-dashboard-empty {
        text-align: center;
        padding: 60px 20px;
        color: var(--text-muted);
    }
    .sync-dashboard-empty-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }
    .sync-dashboard-empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-default);
        margin-bottom: 8px;
    }
    /* Health view styles */
    .health-view {
        padding: 24px;
        font-family: var(--font-family);
    }
    .health-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
    }
    .health-header-icon {
        font-size: 28px;
        color: var(--text-muted);
    }
    .health-header-title {
        font-size: 24px;
        font-weight: 600;
        color: var(--text-default);
    }
    .health-version-card {
        background: var(--bg-hover);
        padding: 16px 20px;
        border-radius: 12px;
        margin-bottom: 24px;
        border: 1px solid var(--border-default);
    }
    .health-version-label {
        font-size: 12px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
    }
    .health-version-value {
        font-size: 32px;
        font-weight: 700;
        color: var(--text-default);
    }
    .health-section-title {
        font-size: 12px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
    }
    .health-plugin-list {
        background: var(--bg-default);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        overflow: hidden;
    }
    .health-plugin-row {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-default);
    }
    .health-plugin-row:last-child {
        border-bottom: none;
    }
    .health-plugin-icon {
        margin-right: 12px;
        font-size: 16px;
    }
    .health-plugin-icon.ok { color: var(--enum-green-fg); }
    .health-plugin-icon.warn { color: var(--enum-orange-fg); }
    .health-plugin-name {
        flex: 1;
        font-weight: 500;
        color: var(--text-default);
    }
    .health-plugin-version {
        font-family: monospace;
        font-size: 13px;
        color: var(--text-muted);
    }
    .health-plugin-version.mismatch {
        color: var(--enum-orange-fg);
        font-weight: 600;
    }
    .health-status-banner {
        margin-top: 20px;
        padding: 14px 16px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 500;
    }
    .health-status-banner.ok {
        background: var(--enum-green-bg);
        color: var(--enum-green-fg);
    }
    .health-status-banner.warn {
        background: var(--enum-orange-bg);
        color: var(--enum-orange-fg);
    }
    .health-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-muted);
    }
    .health-columns {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 24px;
        margin-bottom: 20px;
    }
    @media (max-width: 800px) {
        .health-columns {
            grid-template-columns: 1fr;
        }
    }
    .health-column {
        min-width: 0;
    }
    .health-column-title {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border-default);
    }
    /* Action buttons row */
    .sync-card-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border-default);
    }
    .sync-card-btn {
        flex: 1;
        padding: 6px 12px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--bg-default);
        color: var(--text-default);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .sync-card-btn:hover {
        background: var(--bg-hover);
        border-color: var(--text-muted);
    }
    .sync-card-btn:active {
        transform: scale(0.97);
    }
    .sync-card-btn.primary {
        background: var(--enum-green-bg);
        border-color: var(--enum-green-bg);
        color: white;
    }
    .sync-card-btn.primary:hover {
        filter: brightness(1.1);
    }
    .sync-card-btn.connect {
        background: var(--enum-blue-bg);
        border-color: var(--enum-blue-bg);
        color: white;
    }
    .sync-card-btn.connect:hover {
        filter: brightness(1.1);
    }
    .sync-card-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

class Plugin extends CollectionPlugin {

    async onLoad() {
        // Find our collection
        const collections = await this.data.getAllCollections();
        this.myCollection = collections.find(c => c.getName() === this.getName());

        if (!this.myCollection) {
            this.log('Could not find own collection!', 'error');
            return;
        }

        // Track registered plugins with versions
        this.registeredPlugins = new Map();

        // Expose API for other collections to register
        window.syncHub = {
            version: VERSION,
            checkVersion: (requiredVersion) => this.checkVersion(requiredVersion),
            register: (config) => this.registerPlugin(config),
            registerHub: (config) => this.registerHub(config),  // For non-sync hubs
            unregister: (pluginId) => this.unregisterPlugin(pluginId),
            requestSync: (pluginId, options) => this.requestSync(pluginId, options),
            registerConnect: (pluginId, connectFn) => this.registerConnect(pluginId, connectFn),
            getStatus: (pluginId) => this.getPluginStatus(pluginId),
            getRegisteredPlugins: () => this.getRegisteredPluginsList(),
            // Markdown utilities
            insertMarkdown: (markdown, record, afterItem) => this.insertMarkdown(markdown, record, afterItem),
            replaceContents: (markdown, record) => this.replaceContents(markdown, record),
            parseLine: (line) => this.parseLine(line),
            parseInlineFormatting: (text) => this.parseInlineFormatting(text),
            // DateTime & formatting utilities
            setLastRun: (record) => this.setLastRun(record),
            formatTimestamp: () => this.formatTimestamp(),
            formatRelativeTime: (date) => this.formatRelativeTime(date),
            // Journal integration
            getTodayJournal: () => this.getTodayJournalRecord(),
            logToJournal: (changes, level) => this.writeChangesToJournal(changes, level),
            // Agent tools - collections register semantic operations
            registerCollectionTools: (config) => this.registerCollectionTools(config),
            getRegisteredTools: () => this.getRegisteredTools(),
            executeToolCall: (name, args) => this.executeToolCall(name, args),
            // Desktop bridge API
            getPlugins: () => this._getPluginList(),
            syncAll: () => this.syncAll(),
        };

        // Track registered sync functions (MUST be before event dispatch!)
        this.syncFunctions = new Map();

        // Track registered connect functions for OAuth plugins
        this.connectFunctions = new Map();

        // Track registered collection tools for agents
        this.collectionTools = new Map();

        // Dispatch event so plugins can (re)register
        console.log('[SyncHub] Ready, dispatching synchub-ready event');
        window.dispatchEvent(new CustomEvent('synchub-ready'));

        // Track currently syncing plugin for status bar
        this.currentlySyncing = null;

        // Status bar item for sync status
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

        // Register Dashboard view
        this.registerDashboardView();

        // Register Health view
        this.registerHealthView();

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

    /**
     * Register the Dashboard custom view for Grafana-style singlestats
     */
    registerDashboardView() {
        this.ui.injectCSS(DASHBOARD_CSS);

        this.views.register("Dashboard", (viewContext) => {
            const element = viewContext.getElement();
            let records = [];
            let container = null;

            /**
             * Get health status for a plugin record
             * @param {Object} record - Plugin record
             * @returns {{dotClass: string, timeText: string, isHealthy: boolean}}
             */
            const getHealthStatus = (record) => {
                const enabled = record.prop('enabled')?.choice();
                const status = record.prop('status')?.choice();
                const lastRun = record.prop('last_run')?.date();
                const lastError = record.prop('last_error')?.text();

                if (enabled === 'no') {
                    return { dotClass: 'disabled', timeText: 'Disabled', isHealthy: true };
                }

                if (status === 'syncing') {
                    return { dotClass: 'syncing', timeText: 'Syncing...', isHealthy: true };
                }

                if (status === 'error') {
                    const errorText = lastError ? lastError.substring(0, 50) : 'Unknown error';
                    return { dotClass: 'error', timeText: errorText, isHealthy: false };
                }

                if (!lastRun) {
                    return { dotClass: 'stale', timeText: 'Never synced', isHealthy: false };
                }

                const now = new Date();
                const lastRunDate = new Date(lastRun);
                const hoursSince = (now - lastRunDate) / (1000 * 60 * 60);

                if (hoursSince > 24) {
                    return {
                        dotClass: 'stale',
                        timeText: this.formatRelativeTime(lastRunDate),
                        isHealthy: false
                    };
                }

                return {
                    dotClass: '',
                    timeText: this.formatRelativeTime(lastRunDate),
                    isHealthy: true
                };
            };

            /**
             * Render the dashboard
             */
            const renderDashboard = () => {
                if (!container) return;
                container.innerHTML = '';

                // Filter to plugin records (have plugin_id)
                const plugins = records.filter(r => r.prop('plugin_id')?.text());

                if (plugins.length === 0) {
                    container.innerHTML = `
                        <div class="sync-dashboard-empty">
                            <div class="sync-dashboard-empty-icon">📡</div>
                            <div class="sync-dashboard-empty-title">No Sync Plugins</div>
                            <div>Install a sync plugin to see it here</div>
                        </div>
                    `;
                    return;
                }

                // Create card grid
                const grid = document.createElement('div');
                grid.className = 'sync-dashboard-grid';

                let healthyCount = 0;
                let errorCount = 0;
                let enabledCount = 0;

                plugins.forEach(record => {
                    const pluginId = record.prop('plugin_id')?.text() || 'unknown';
                    const pluginName = record.getName() || pluginId;
                    const enabled = record.prop('enabled')?.choice();
                    const status = record.prop('status')?.choice() || 'idle';
                    const interval = record.prop('interval')?.text() || 'manual';
                    const health = getHealthStatus(record);

                    // Get icon from registered sync function if available
                    const syncFunc = this.syncFunctions.get(pluginId);
                    const icon = syncFunc?.icon || 'refresh';

                    if (enabled === 'yes') {
                        enabledCount++;
                        if (health.isHealthy) healthyCount++;
                        else errorCount++;
                    }

                    const card = document.createElement('div');
                    card.className = 'sync-card';
                    card.setAttribute('data-status', status);
                    card.setAttribute('data-enabled', enabled || 'no');

                    const dotContent = health.dotClass === 'syncing'
                        ? '<span class="ti ti-blinking-dot"></span>'
                        : '';

                    // Check if this plugin has a connect function (OAuth)
                    const hasConnect = this.connectFunctions.has(pluginId);
                    const isSyncing = status === 'syncing';

                    card.innerHTML = `
                        <div class="sync-card-header" style="cursor: pointer;">
                            <span class="sync-card-icon ti ti-${icon}"></span>
                            <span class="sync-card-name">${this.escapeHtml(pluginName)}</span>
                            <span class="sync-card-dot ${health.dotClass}">${dotContent}</span>
                        </div>
                        <div class="sync-card-body">
                            <div class="sync-card-value">${enabled === 'yes' ? this.escapeHtml(interval) : '—'}</div>
                            <div class="sync-card-label">${enabled === 'yes' ? 'interval' : 'paused'}</div>
                        </div>
                        <div class="sync-card-footer">
                            <div class="sync-card-time">${this.escapeHtml(health.timeText)}</div>
                            ${status === 'error' && record.prop('last_error')?.text() ?
                                `<div class="sync-card-error" title="${this.escapeHtml(record.prop('last_error')?.text() || '')}">${this.escapeHtml(record.prop('last_error')?.text()?.substring(0, 40) || '')}...</div>`
                                : ''}
                        </div>
                        <div class="sync-card-actions">
                            ${hasConnect ? `<button class="sync-card-btn connect" data-action="connect">Connect</button>` : ''}
                            <button class="sync-card-btn primary" data-action="sync" ${isSyncing ? 'disabled' : ''}>${isSyncing ? 'Syncing...' : 'Sync'}</button>
                            <button class="sync-card-btn" data-action="full" ${isSyncing ? 'disabled' : ''}>Full</button>
                        </div>
                    `;

                    // Header click opens config
                    card.querySelector('.sync-card-header').addEventListener('click', (e) => {
                        e.stopPropagation();
                        viewContext.openRecordInOtherPanel(record.guid);
                    });

                    // Button clicks
                    card.querySelectorAll('.sync-card-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const action = btn.getAttribute('data-action');
                            if (action === 'sync') {
                                this.requestSync(pluginId, { manual: true });
                            } else if (action === 'full') {
                                this.requestSync(pluginId, { full: true, manual: true });
                            } else if (action === 'connect') {
                                const connectFn = this.connectFunctions.get(pluginId);
                                if (connectFn) connectFn();
                            }
                        });
                    });

                    grid.appendChild(card);
                });

                container.appendChild(grid);

                // Summary row
                const summaryClass = errorCount > 0 ? 'error' : (enabledCount === healthyCount ? 'healthy' : 'warning');
                const summary = document.createElement('div');
                summary.className = 'sync-dashboard-summary';
                summary.innerHTML = `
                    <div class="sync-summary-item">
                        <span class="sync-summary-value">${enabledCount}</span>
                        <span>plugins active</span>
                    </div>
                    <div class="sync-summary-item">
                        <span class="sync-summary-dot ${summaryClass}"></span>
                        <span>${errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : 'All healthy'}</span>
                    </div>
                `;
                container.appendChild(summary);
            };

            return {
                onLoad: () => {
                    viewContext.makeWideLayout();
                    element.style.overflow = 'auto';
                    container = document.createElement('div');
                    container.className = 'sync-dashboard';
                    element.appendChild(container);
                },
                onRefresh: ({ records: newRecords }) => {
                    records = newRecords;
                    renderDashboard();
                },
                onPanelResize: () => {},
                onDestroy: () => {
                    container = null;
                    records = [];
                },
                onFocus: () => {},
                onBlur: () => {},
                onKeyboardNavigation: () => {}
            };
        });
    }

    /**
     * Register the Health custom view for version checking
     */
    registerHealthView() {
        this.views.register("Health", (viewContext) => {
            const element = viewContext.getElement();
            let container = null;

            const renderHealth = () => {
                if (!container) return;

                const allPlugins = this.getRegisteredPluginsList();
                const hubs = allPlugins.filter(p => p.isHub);
                const collections = allPlugins.filter(p => p.isCollection);
                const syncPlugins = allPlugins.filter(p => !p.isHub && !p.isCollection);

                const unknowns = allPlugins.filter(p => p.isUnknown);
                const mismatches = allPlugins.filter(p => !p.versionMatch && !p.isUnknown);
                const hasIssues = unknowns.length > 0 || mismatches.length > 0;

                const renderColumn = (title, items) => {
                    if (items.length === 0) {
                        return `
                            <div class="health-column">
                                <div class="health-column-title">${title}</div>
                                <div style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">None registered</div>
                            </div>
                        `;
                    }
                    return `
                        <div class="health-column">
                            <div class="health-column-title">${title}</div>
                            <div class="health-plugin-list">
                                ${items.map(p => `
                                    <div class="health-plugin-row">
                                        <span class="health-plugin-icon ${p.versionMatch ? 'ok' : 'warn'} ti ti-${p.versionMatch ? 'check' : 'alert-triangle'}"></span>
                                        <span class="health-plugin-name">${this.escapeHtml(p.name)}</span>
                                        <span class="health-plugin-version ${p.versionMatch ? '' : 'mismatch'}">${p.version}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                };

                container.innerHTML = `
                    <div class="health-header">
                        <span class="health-header-icon ti ti-stethoscope"></span>
                        <span class="health-header-title">Health Check</span>
                        <span style="margin-left: auto; font-size: 14px; color: var(--text-muted);">SyncHub ${VERSION}</span>
                    </div>

                    ${allPlugins.length === 0 ? `
                        <div class="health-empty">
                            <div style="font-size: 32px; margin-bottom: 12px;">📡</div>
                            <div>No plugins registered yet</div>
                            <div style="font-size: 12px; margin-top: 8px;">Install a sync plugin to see it here</div>
                        </div>
                    ` : `
                        <div class="health-columns">
                            ${renderColumn('Hubs', hubs)}
                            ${renderColumn('Collections', collections)}
                            ${renderColumn('Sync Plugins', syncPlugins)}
                        </div>

                        ${hasIssues ? `
                            <div class="health-status-banner warn">
                                <span class="ti ti-alert-triangle"></span>
                                <span>${unknowns.length > 0 ? `${unknowns.length} need updating (unknown).` : ''} ${mismatches.length > 0 ? `${mismatches.length} version mismatch.` : ''} Update all to ${VERSION}.</span>
                            </div>
                        ` : `
                            <div class="health-status-banner ok">
                                <span class="ti ti-check"></span>
                                <span>All ${allPlugins.length} components up to date!</span>
                            </div>
                        `}
                    `}
                `;
            };

            return {
                onLoad: () => {
                    viewContext.makeWideLayout();
                    element.style.overflow = 'auto';
                    container = document.createElement('div');
                    container.className = 'health-view';
                    element.appendChild(container);
                    renderHealth();
                },
                onRefresh: () => {
                    renderHealth();
                },
                onPanelResize: () => {},
                onDestroy: () => {
                    container = null;
                },
                onFocus: () => {
                    renderHealth();
                },
                onBlur: () => {},
                onKeyboardNavigation: () => {}
            };
        });
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
     * @param {string} config.version - Plugin version (e.g., 'v1.0.0')
     */
    async registerPlugin(config) {
        const { id, name, icon, sync, defaultInterval = '5m', version } = config;

        if (!id || !sync) {
            this.log(`Registration failed: missing id or sync function`, 'error');
            return null;
        }

        // Store the sync function
        this.syncFunctions.set(id, sync);

        // Track plugin version
        this.registeredPlugins.set(id, {
            name: name || id,
            version: version || 'unknown',
            registeredAt: new Date()
        });

        // Version mismatch warning
        if (version && version !== VERSION) {
            console.warn(`[SyncHub] ⚠️ Version mismatch: ${name || id} is ${version}, but SyncHub is ${VERSION}`);
        }

        console.log(`[SyncHub] Registered plugin: ${id} ${version || ''} (${this.syncFunctions.size} total)`);

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
        this.registeredPlugins.delete(pluginId);
    }

    /**
     * Register a hub (non-sync plugin) for health tracking
     * @param {Object} config
     * @param {string} config.id - Unique hub ID (e.g., 'agenthub')
     * @param {string} config.name - Display name
     * @param {string} config.version - Hub version (e.g., 'v1.0.0')
     */
    registerHub(config) {
        const { id, name, version } = config;

        if (!id) {
            this.log(`Hub registration failed: missing id`, 'error');
            return;
        }

        // Track hub version (no sync function needed)
        this.registeredPlugins.set(id, {
            name: name || id,
            version: version || 'unknown',
            registeredAt: new Date(),
            isHub: true
        });

        // Version mismatch warning
        if (version && version !== VERSION) {
            console.warn(`[SyncHub] ⚠️ Version mismatch: ${name || id} is ${version}, but SyncHub is ${VERSION}`);
        }

        console.log(`[SyncHub] Registered hub: ${id} ${version || ''}`);
    }

    /**
     * Check if a version meets requirements (for plugins to check SyncHub version)
     */
    checkVersion(requiredVersion) {
        if (!requiredVersion) return true;
        // Simple string comparison works for semver format vX.Y.Z
        return VERSION >= requiredVersion;
    }

    /**
     * Get list of registered plugins with their versions
     */
    getRegisteredPluginsList() {
        const plugins = [];
        for (const [id, info] of this.registeredPlugins) {
            const isUnknown = !info.version || info.version === 'unknown';
            plugins.push({
                id,
                name: info.name,
                version: info.version || 'unknown',
                versionMatch: !isUnknown && info.version === VERSION,
                isUnknown,
                isHub: info.isHub || false,
                isCollection: info.isCollection || false,
                syncHubVersion: VERSION
            });
        }
        return plugins;
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

    /**
     * Generate a random sync_run_id for lock acquisition
     */
    generateSyncRunId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    /**
     * Attempt to acquire a sync lock using double-read pattern.
     * Prevents duplicate syncs when multiple Thymer instances are running.
     *
     * @param {Object} record - The plugin's Sync Hub record
     * @returns {string|null} - The sync_run_id if lock acquired, null if failed
     */
    async acquireSyncLock(record) {
        const syncRunId = this.generateSyncRunId();
        const now = Date.now();

        // Step 1: Check current lock state
        const currentLock = record.text('sync_lock');
        if (currentLock) {
            try {
                const lock = JSON.parse(currentLock);
                const lockAge = now - lock.timestamp;

                // If lock is recent (not stale), another instance is syncing
                if (lockAge < LOCK_TIMEOUT_MS) {
                    console.log(`[SyncHub] Lock held by another instance (age: ${Math.round(lockAge/1000)}s)`);
                    return null;
                }
                // Lock is stale, we can take it
                console.log(`[SyncHub] Taking over stale lock (age: ${Math.round(lockAge/1000)}s)`);
            } catch (e) {
                // Invalid JSON, treat as unlocked
            }
        }

        // Step 2: Write our lock
        const lockData = JSON.stringify({ timestamp: now, sync_run_id: syncRunId });
        record.prop('sync_lock')?.set(lockData);

        // Step 3: Wait for other instances to potentially write their lock
        // Jitter reduces chance of simultaneous re-reads
        const settleTime = LOCK_SETTLE_MIN_MS + Math.random() * LOCK_SETTLE_JITTER_MS;
        await new Promise(resolve => setTimeout(resolve, settleTime));

        // Step 4: Re-read and verify we still have the lock
        // Need to re-fetch the record to get fresh data
        const freshRecord = await this.findPluginRecord(record.text('plugin_id'));
        if (!freshRecord) {
            console.log('[SyncHub] Record disappeared during lock acquisition');
            return null;
        }

        const verifyLock = freshRecord.text('sync_lock');
        if (!verifyLock) {
            console.log('[SyncHub] Lock was cleared during acquisition');
            return null;
        }

        try {
            const lock = JSON.parse(verifyLock);
            if (lock.sync_run_id === syncRunId) {
                // We have the lock!
                return syncRunId;
            } else {
                // Another instance won the race
                console.log(`[SyncHub] Lost lock race to another instance`);
                return null;
            }
        } catch (e) {
            console.log('[SyncHub] Lock verification failed:', e.message);
            return null;
        }
    }

    /**
     * Release the sync lock
     * @param {Object} record - The plugin's Sync Hub record
     */
    releaseSyncLock(record) {
        record.prop('sync_lock')?.set(null);
    }

    /**
     * Request a sync for a plugin
     * @param {string} pluginId - The plugin ID
     * @param {Object} options - Optional settings
     * @param {boolean} options.full - If true, clears last_run to force full sync
     * @param {boolean} options.manual - If true, always show toast (for UI-triggered syncs)
     */
    async requestSync(pluginId, options = {}) {
        const record = await this.findPluginRecord(pluginId);
        if (!record) {
            this.log(`Cannot sync unknown plugin: ${pluginId}`, 'error');
            return;
        }

        // Full sync: clear last_run to force fetching everything
        if (options.full) {
            record.prop('last_run')?.set(null);
            console.log(`[SyncHub] Full sync requested for ${pluginId}, cleared last_run`);
        }

        await this.runSync(pluginId, record, { manual: options.manual });
    }

    /**
     * Register a connect function for OAuth plugins
     * Called from dashboard "Connect" button
     */
    registerConnect(pluginId, connectFn) {
        this.connectFunctions.set(pluginId, connectFn);
        console.log(`[SyncHub] Registered connect function for: ${pluginId}`);
    }

    async runSync(pluginId, record, options = {}) {
        const syncFn = this.syncFunctions.get(pluginId);
        if (!syncFn) {
            this.log(`No sync function for: ${pluginId}`, 'warn');
            return;
        }

        // Acquire sync lock (prevents duplicate syncs across Thymer instances)
        const syncRunId = await this.acquireSyncLock(record);
        if (!syncRunId) {
            // Another instance is already syncing this plugin
            if (options.manual) {
                this.ui.addToaster({
                    title: pluginId,
                    message: 'Sync already in progress (another tab?)',
                    dismissible: true,
                    autoDestroyTime: 3000,
                });
            }
            return;
        }

        const logLevel = record.prop('log_level')?.choice() || 'info';
        const toastLevel = record.prop('toast')?.choice() || 'new_records';
        const journalLevel = record.prop('journal')?.choice() || 'none';
        const isManual = options.manual === true;

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
            // ALWAYS release lock and reset status
            this.releaseSyncLock(record);
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

                // Always toast for manual syncs, otherwise respect toast level
                if (isManual || this.shouldToast(toastLevel, result)) {
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
        const timestamp = this.formatTimestamp();

        // Append to Sync Hub record body with verb + title + record reference
        try {
            const record = this.data.getRecord(syncHubRecordGuid);
            if (!record) return;

            // Find the last top-level line item
            const existingItems = await record.getLineItems();
            const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
            const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

            // Create new line item: **2025-01-15 15:21** verb "title" [Record]
            const newItem = await record.createLineItem(null, lastItem, 'text');
            if (newItem) {
                const segments = [
                    { type: 'bold', text: timestamp },
                    { type: 'text', text: ` ${verb}` }
                ];

                // Include title if provided (plugin controls format)
                if (title) {
                    segments.push({ type: 'text', text: ` ${title}` });
                }

                // Add record reference if provided
                if (targetRecordGuid) {
                    segments.push({ type: 'text', text: ' ' });
                    segments.push({ type: 'ref', text: { guid: targetRecordGuid } });
                }

                newItem.setSegments(segments);
            }
        } catch (e) {
            // Silently fail - logging shouldn't break sync
        }
    }

    formatTimestamp() {
        const now = new Date();
        const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const time = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        return `${date} ${time}`;
    }

    async appendLog(recordGuid, message, logLevel = 'info') {
        const timestamp = this.formatTimestamp();

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

    /**
     * Find a record by GUID across all collections.
     */
    async findRecordByGUID(guid) {
        try {
            const collections = await this.data.getAllCollections();
            for (const col of collections) {
                const records = await col.getAllRecords();
                const record = records.find(r => r.guid === guid);
                if (record) return record;
            }
            return null;
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
                // Create parent line: **15:21** added [[Record Title]]
                // Or for recurring: **15:21** added 7 instances of [[Record Title]]
                const parentItem = await journalRecord.createLineItem(null, lastItem, 'text');
                if (parentItem) {
                    const segments = [
                        { type: 'bold', text: timestamp },
                        { type: 'text', text: ` ${change.verb} ` },
                    ];

                    // Add count for recurring events
                    if (change.count && change.count > 1) {
                        segments.push({ type: 'text', text: `${change.count} instances of ` });
                    }

                    segments.push({ type: 'ref', text: { guid: change.guid } });
                    parentItem.setSegments(segments);
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
    // Agent Tools - Collection-registered semantic operations
    // =========================================================================

    /**
     * Register tools for a collection.
     * Collections call this to expose semantic operations to agents.
     *
     * @param {Object} config
     * @param {string} config.collection - Collection name
     * @param {string} config.description - Human-readable description
     * @param {Object} config.schema - Field descriptions for the collection
     * @param {Array} config.tools - Array of tool definitions
     * @param {string} config.version - Collection plugin version (e.g., 'v1.0.0')
     */
    registerCollectionTools(config) {
        const { collection, description, schema, tools, version } = config;

        if (!collection || !tools) {
            this.log('registerCollectionTools: missing collection or tools', 'error');
            return;
        }

        // Store the collection config
        this.collectionTools.set(collection, {
            description: description || collection,
            schema: schema || {},
            tools: tools || []
        });

        // Also register for health tracking
        const collectionId = collection.toLowerCase().replace(/\s+/g, '-');
        this.registeredPlugins.set(collectionId, {
            name: collection,
            version: version || 'unknown',
            registeredAt: new Date(),
            isCollection: true
        });

        // Version mismatch warning
        if (version && version !== VERSION) {
            console.warn(`[SyncHub] ⚠️ Version mismatch: ${collection} is ${version}, but SyncHub is ${VERSION}`);
        }

        console.log(`[SyncHub] Registered ${tools.length} tools for collection: ${collection} ${version || ''}`);
    }

    /**
     * Get all registered tools in OpenAI function calling format.
     * AgentHub calls this to build the tools array for LLM calls.
     */
    getRegisteredTools() {
        const allTools = [];

        // Add core tools (search, journal, etc.)
        allTools.push(...this.getCoreTools());

        // Add collection-specific tools
        for (const [collectionName, config] of this.collectionTools) {
            for (const tool of config.tools) {
                allTools.push({
                    type: 'function',
                    function: {
                        name: `${collectionName.toLowerCase()}_${tool.name}`,
                        description: `[${collectionName}] ${tool.description}`,
                        parameters: this.buildParameters(tool.parameters)
                    },
                    _handler: tool.handler,
                    _collection: collectionName
                });
            }
        }

        return allTools;
    }

    /**
     * Execute a tool call by name.
     * AgentHub calls this when the LLM invokes a tool.
     */
    async executeToolCall(name, args) {
        console.log(`[SyncHub] Executing tool: ${name}`, args);

        // Check core tools first
        const coreResult = await this.executeCoreToolCall(name, args);
        if (coreResult !== null) {
            return coreResult;
        }

        // Find collection tool
        for (const [collectionName, config] of this.collectionTools) {
            const prefix = collectionName.toLowerCase() + '_';
            if (name.startsWith(prefix)) {
                const toolName = name.slice(prefix.length);
                const tool = config.tools.find(t => t.name === toolName);
                if (tool?.handler) {
                    try {
                        return await tool.handler(args, this.data, this.ui);
                    } catch (e) {
                        return { error: e.message };
                    }
                }
            }
        }

        return { error: `Unknown tool: ${name}` };
    }

    /**
     * Core tools available to all agents.
     */
    getCoreTools() {
        return [
            {
                type: 'function',
                function: {
                    name: 'search_workspace',
                    description: 'Search across all collections for relevant context. Use this to find information before answering questions.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query - keywords or phrases' },
                            limit: { type: 'number', description: 'Max results (default: 5)' }
                        },
                        required: ['query']
                    }
                },
                _core: true
            },
            {
                type: 'function',
                function: {
                    name: 'list_collections',
                    description: 'List all available collections and their schemas. Use this to understand what data is available.',
                    parameters: { type: 'object', properties: {}, required: [] }
                },
                _core: true
            },
            {
                type: 'function',
                function: {
                    name: 'get_note',
                    description: 'Get a note by GUID. Returns title, fields, and body content.',
                    parameters: {
                        type: 'object',
                        properties: {
                            guid: { type: 'string', description: 'Note GUID (from search results)' }
                        },
                        required: ['guid']
                    }
                },
                _core: true
            },
            {
                type: 'function',
                function: {
                    name: 'append_to_note',
                    description: 'Append markdown content to a note. Use search_workspace to find the GUID first.',
                    parameters: {
                        type: 'object',
                        properties: {
                            guid: { type: 'string', description: 'Note GUID (from search results)' },
                            content: { type: 'string', description: 'Markdown content to append' }
                        },
                        required: ['guid', 'content']
                    }
                },
                _core: true
            },
            {
                type: 'function',
                function: {
                    name: 'log_to_journal',
                    description: 'Add an entry to today\'s journal.',
                    parameters: {
                        type: 'object',
                        properties: {
                            content: { type: 'string', description: 'Content to add' }
                        },
                        required: ['content']
                    }
                },
                _core: true
            },
            {
                type: 'function',
                function: {
                    name: 'get_todays_journal',
                    description: 'Get today\'s journal/daily note content. Note: late night (2-3am) may still return yesterday\'s journal if the user hasn\'t created today\'s yet.',
                    parameters: {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                },
                _core: true
            },
            {
                type: 'function',
                function: {
                    name: 'save_note',
                    description: 'Create a new note in a collection. Title is extracted from the first # heading. Returns the new note GUID.',
                    parameters: {
                        type: 'object',
                        properties: {
                            collection: { type: 'string', description: 'Collection name (e.g., "Captures", "Issues")' },
                            content: { type: 'string', description: 'Markdown content. First # heading becomes the title.' }
                        },
                        required: ['collection', 'content']
                    }
                },
                _core: true
            }
        ];
    }

    /**
     * Execute core tool calls.
     */
    async executeCoreToolCall(name, args) {
        switch (name) {
            case 'search_workspace':
                return this.toolSearchWorkspace(args);
            case 'list_collections':
                return this.toolListCollections();
            case 'get_note':
                return this.toolGetNote(args);
            case 'append_to_note':
                return this.toolAppendToNote(args);
            case 'log_to_journal':
                return this.toolLogToJournal(args);
            case 'get_todays_journal':
                return this.toolGetTodaysJournal();
            case 'save_note':
                return this.toolSaveNote(args);
            default:
                return null; // Not a core tool
        }
    }

    async toolSearchWorkspace({ query, limit = 5 }) {
        try {
            const result = await this.data.searchByQuery(query, limit);
            return {
                query,
                results: (result.records || []).map(r => ({
                    guid: r.guid,
                    title: r.getName?.() || 'Untitled',
                    snippet: r.snippet || ''
                }))
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolListCollections() {
        const collections = {};

        // Get ALL collections from Thymer
        const allCollections = await this.data.getAllCollections();

        for (const col of allCollections) {
            const name = col.getName();
            // Skip internal collections
            if (name === 'Sync Hub' || name === 'Journal') continue;

            // Check if this collection has registered tools
            const registered = this.collectionTools.get(name);

            // Try to extract schema from collection properties
            let schema = {};
            if (registered?.schema) {
                schema = registered.schema;
            } else {
                // For "dumb" collections, try to get schema from first record
                try {
                    const records = await col.getAllRecords();
                    if (records.length > 0) {
                        const props = records[0].getAllProperties?.() || [];
                        for (const prop of props) {
                            if (prop.name) {
                                schema[prop.name] = prop.type || 'text';
                            }
                        }
                    }
                } catch (e) {
                    // Ignore schema extraction errors
                }
            }

            collections[name] = {
                guid: col.guid,
                description: registered?.description || `${name} collection`,
                schema,
                tools: registered ? registered.tools.map(t => t.name) : [],
                has_tools: !!registered
            };
        }

        return { collections };
    }

    async toolGetNote({ guid }) {
        try {
            if (!guid) {
                return { error: 'GUID required' };
            }

            // Search all collections for the record
            const record = await this.findRecordByGUID(guid);
            if (!record) {
                return { error: `Note not found: ${guid}` };
            }

            const props = record.getAllProperties?.() || [];
            const fields = {};
            for (const prop of props) {
                const value = prop.choice?.() || prop.text?.() || prop.number?.() || null;
                if (value) fields[prop.name || prop.id] = value;
            }

            const lineItems = await record.getLineItems?.() || [];
            const body = lineItems
                .filter(item => item.parent_guid === record.guid)
                .map(item => item.segments?.map(s => {
                    if (s.type === 'ref' && typeof s.text === 'object') {
                        return `[[${s.text.guid}]]`;
                    }
                    return s.text || '';
                }).join('') || '')
                .join('\n');

            return {
                guid: record.guid,
                title: record.getName?.() || 'Untitled',
                fields,
                body: body || '(empty)'
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolAppendToNote({ guid, content }) {
        try {
            if (!guid) {
                return { error: 'GUID required' };
            }
            if (!content) {
                return { error: 'Content required' };
            }

            // Search all collections for the record
            const record = await this.findRecordByGUID(guid);
            if (!record) {
                return { error: `Note not found: ${guid}` };
            }

            // Find last top-level item to append after
            const lineItems = await record.getLineItems?.() || [];
            const topLevel = lineItems.filter(item => item.parent_guid === record.guid);
            const lastItem = topLevel.length > 0 ? topLevel[topLevel.length - 1] : null;

            await this.insertMarkdown(content, record, lastItem);
            return { success: true, guid };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolLogToJournal({ content }) {
        try {
            const journal = await this.getTodayJournalRecord();
            if (!journal) {
                return { error: 'Journal not available' };
            }
            // Find last top-level item to append after
            const lineItems = await journal.getLineItems?.() || [];
            const topLevel = lineItems.filter(item => item.parent_guid === journal.guid);
            const lastItem = topLevel.length > 0 ? topLevel[topLevel.length - 1] : null;
            await this.insertMarkdown(content, journal, lastItem);
            return { success: true };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolGetTodaysJournal() {
        try {
            const journal = await this.getTodayJournalRecord();
            if (!journal) {
                return { error: 'No journal found for today. Open your daily note first to create it.' };
            }

            const props = journal.getAllProperties?.() || [];
            const fields = {};
            for (const prop of props) {
                const value = prop.choice?.() || prop.text?.() || prop.number?.() || null;
                if (value) fields[prop.name || prop.id] = value;
            }

            const lineItems = await journal.getLineItems?.() || [];
            const body = lineItems
                .filter(item => item.parent_guid === journal.guid)
                .map(item => item.segments?.map(s => {
                    if (s.type === 'ref' && typeof s.text === 'object') {
                        return `[[${s.text.guid}]]`;
                    }
                    return s.text || '';
                }).join('') || '')
                .join('\n');

            return {
                guid: journal.guid,
                title: journal.getName?.() || 'Today',
                date: journal.guid.slice(-8), // YYYYMMDD from GUID
                fields,
                body: body || '(empty)'
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolSaveNote({ collection, content }) {
        try {
            if (!collection) {
                return { error: 'Collection name required' };
            }
            if (!content) {
                return { error: 'Content required' };
            }

            // Find the collection by name
            const allCollections = await this.data.getAllCollections();
            const targetCollection = allCollections.find(c =>
                c.getName().toLowerCase() === collection.toLowerCase()
            );

            if (!targetCollection) {
                const available = allCollections.map(c => c.getName()).join(', ');
                return { error: `Collection "${collection}" not found. Available: ${available}` };
            }

            // Extract title from first # heading
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

            // Create the record
            const guid = targetCollection.createRecord(title);
            if (!guid) {
                return { error: 'Failed to create record' };
            }

            // Wait for record to be available (SDK quirk)
            await new Promise(r => setTimeout(r, 50));

            // Get the record from the collection (getRecordByGUID not available on this.data)
            const records = await targetCollection.getAllRecords();
            const record = records.find(r => r.guid === guid);
            if (!record) {
                return { error: 'Record created but not found' };
            }

            // Remove the title heading from content (it's already the record title)
            let bodyContent = content;
            if (titleMatch) {
                bodyContent = content.replace(/^#\s+.+\n?/, '').trim();
            }

            // Insert the body content
            if (bodyContent) {
                await this.insertMarkdown(bodyContent, record, null);
            }

            return {
                success: true,
                guid,
                title,
                collection: targetCollection.getName()
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Build OpenAI-compatible parameters object from simple schema.
     * Supports:
     *   - Simple: { field: 'string' } or { field: 'string?' } (optional)
     *   - With enum: { field: { type: 'string', enum: ['a', 'b'] } }
     *   - With description: { field: { type: 'string', description: '...' } }
     */
    buildParameters(params) {
        if (!params) return { type: 'object', properties: {}, required: [] };

        const properties = {};
        const required = [];

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                // Simple format: 'string' or 'string?'
                const isRequired = !value.endsWith('?');
                const cleanType = value.replace('?', '');
                properties[key] = { type: cleanType };
                if (isRequired) required.push(key);
            } else if (typeof value === 'object') {
                // Complex format with type, enum, description
                properties[key] = { ...value };
                // If no explicit optional marker, assume required
                if (!value.optional) required.push(key);
            }
        }

        return { type: 'object', properties, required };
    }

    // =========================================================================
    // Markdown Utilities (shared via window.syncHub)
    // =========================================================================

    /**
     * Insert markdown into a record using promise chaining (non-blocking).
     * Flat structure - Thymer's heading folding provides hierarchy.
     */
    async insertMarkdown(markdown, targetRecord, afterItem = null) {
        if (!targetRecord) {
            this.log('insertMarkdown: No target record provided', 'error');
            return 0;
        }

        const record = targetRecord;
        const self = this;
        let promise = Promise.resolve(afterItem);
        let rendered = 0;
        let inCode = false, codeLang = '', codeLines = [];
        let isFirstBlock = true;

        for (const line of markdown.split('\n')) {
            // Code fence (handles indented fences)
            const fenceMatch = line.match(/^(\s*)```(.*)$/);
            if (fenceMatch) {
                if (inCode) {
                    const lang = codeLang, code = [...codeLines];
                    promise = promise.then(async (last) => {
                        const block = await record.createLineItem(null, last, 'block');
                        if (!block) return last;
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

            const parsed = this.parseLine(line);
            if (!parsed) continue;

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
                if (!item) return last;

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
        return rendered;
    }

    /**
     * Simple hash function for content comparison.
     * Not cryptographic - just for change detection.
     */
    hashContent(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }

    /**
     * Replace all contents of a record with new markdown.
     * Uses hash to skip unchanged content, updates existing items in place.
     */
    async replaceContents(markdown, record) {
        if (!record) {
            this.log('replaceContents: No record provided', 'error');
            return 0;
        }

        // Check hash - skip if content unchanged
        const newHash = this.hashContent(markdown);
        const oldHash = record.text('content_hash');
        if (newHash === oldHash) {
            return 0; // No changes needed
        }

        // Get existing top-level line items
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(i => i.parent_guid === record.guid);

        // Parse new markdown into lines/blocks
        const newLines = this.parseMarkdownToLines(markdown);

        // Update existing items or create new ones
        let itemIndex = 0;
        let lastItem = null;

        for (const lineData of newLines) {
            if (itemIndex < topLevelItems.length) {
                // Update existing item
                const item = topLevelItems[itemIndex];
                item.setSegments(lineData.segments);
                // Note: can't change item type (heading vs text), but segments update works
                lastItem = item;
            } else {
                // Create new item
                const item = await record.createLineItem(null, lastItem, lineData.type);
                if (item) {
                    if (lineData.type === 'heading' && lineData.level > 1) {
                        try { item.setHeadingSize?.(lineData.level); } catch(e) {}
                    }
                    item.setSegments(lineData.segments);
                    lastItem = item;
                }
            }
            itemIndex++;
        }

        // Clear any extra existing items (can't delete, so empty them)
        for (let i = itemIndex; i < topLevelItems.length; i++) {
            topLevelItems[i].setSegments([]);
        }

        // Store new hash
        record.prop('content_hash')?.set(newHash);

        return newLines.length;
    }

    /**
     * Parse markdown into line data for replaceContents.
     * Simplified version that handles basic formatting.
     */
    parseMarkdownToLines(markdown) {
        const lines = [];
        let inCode = false, codeLang = '', codeLines = [];

        for (const line of markdown.split('\n')) {
            // Code fence
            const fenceMatch = line.match(/^(\s*)```(.*)$/);
            if (fenceMatch) {
                if (inCode) {
                    // End of code block - add as single block
                    lines.push({
                        type: 'block',
                        segments: [{ type: 'text', text: codeLines.join('\n') }],
                        lang: codeLang
                    });
                    inCode = false;
                    codeLang = '';
                    codeLines = [];
                } else {
                    inCode = true;
                    codeLang = fenceMatch[2].trim();
                }
                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            if (!line.trim()) continue;

            const parsed = this.parseLine(line);
            if (parsed) {
                lines.push(parsed);
            }
        }

        return lines;
    }

    /**
     * Parse a single line of markdown into type + segments.
     * Returns { type, segments, level? } or null for empty lines.
     */
    parseLine(line) {
        if (!line.trim()) return null;

        // Horizontal rule
        if (/^(\*\s*\*\s*\*|\-\s*\-\s*\-|_\s*_\s*_)[\s\*\-_]*$/.test(line.trim())) {
            return { type: 'br', segments: [] };
        }

        // Headings (returns level for setHeadingSize)
        const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
            return {
                type: 'heading',
                level: hMatch[1].length,
                segments: this.parseInlineFormatting(hMatch[2])
            };
        }

        // Task list
        const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/);
        if (taskMatch) {
            return { type: 'task', segments: this.parseInlineFormatting(taskMatch[3]) };
        }

        // Unordered list (handles indented items)
        const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
        if (ulMatch) {
            return { type: 'ulist', segments: this.parseInlineFormatting(ulMatch[2]) };
        }

        // Ordered list (handles indented items)
        const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
        if (olMatch) {
            return { type: 'olist', segments: this.parseInlineFormatting(olMatch[2]) };
        }

        // Quote
        if (line.startsWith('> ')) {
            return { type: 'quote', segments: this.parseInlineFormatting(line.slice(2)) };
        }

        // Regular text
        return { type: 'text', segments: this.parseInlineFormatting(line) };
    }

    /**
     * Parse inline formatting (bold, italic, code, links, record refs).
     * Exposed via window.syncHub for other plugins.
     *
     * Special: [[GUID]] creates a clickable record reference in Thymer.
     * Agents can use this to link to records they return from tool calls.
     */
    parseInlineFormatting(text) {
        const segments = [];
        const patterns = [
            { regex: /`([^`]+)`/, type: 'code' },
            { regex: /\[\[([A-Za-z0-9-]{20,})\]\]/, type: 'ref' },  // [[GUID]] record reference
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
                    // Links become plain text (Thymer doesn't support external links in segments)
                    segments.push({ type: 'text', text: earliestMatch[1] });
                } else if (matchedPattern.type === 'ref') {
                    // Record reference: [[GUID]] -> { type: 'ref', text: { guid: 'xxx' } }
                    segments.push({ type: 'ref', text: { guid: earliestMatch[1] } });
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
     * Format a date as relative time (e.g., "5m ago")
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
     * Update status bar based on current sync state
     */
    async updateStatusBar() {
        if (!this.statusBarItem) return;

        try {
            const records = await this.myCollection?.getAllRecords() || [];

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
            console.error('[SyncHub] Error updating status bar:', e);
        }
    }

    /**
     * Build HTML label for SyncHub status bar (ti-server icon)
     */
    buildStatusLabel(state, extra = '') {
        const baseStyle = 'font-size: 16px;';
        let style = '';
        let iconStyle = baseStyle;

        switch (state) {
            case 'syncing':
                // Glow animation for syncing
                style = `<style>
                    @keyframes syncGlow {
                        0%, 100% { filter: drop-shadow(0 0 2px #60a5fa); opacity: 1; }
                        50% { filter: drop-shadow(0 0 6px #60a5fa); opacity: 0.8; }
                    }
                </style>`;
                iconStyle = `${baseStyle} color: #60a5fa; animation: syncGlow 1s ease-in-out infinite;`;
                break;
            case 'error':
                iconStyle = `${baseStyle} color: #f87171;`;
                break;
            case 'idle':
                iconStyle = `${baseStyle} color: #4ade80;`;
                break;
            case 'disabled':
                iconStyle = `${baseStyle} opacity: 0.4;`;
                break;
            default:
                iconStyle = `${baseStyle} opacity: 0.4;`;
        }

        return `${style}<span class="ti ti-server" style="${iconStyle}"></span>`;
    }

    /**
     * Get list of registered sync plugins (for Desktop Bridge API)
     */
    _getPluginList() {
        const plugins = [];
        for (const [pluginId, _] of this.syncFunctions) {
            plugins.push({
                name: pluginId,
                enabled: true // We only track registered (enabled) plugins
            });
        }
        return plugins;
    }

    /**
     * Get human-readable name for a plugin ID
     */
    getPluginName(pluginId) {
        const names = {
            'github-sync': 'GitHub',
            'readwise-sync': 'Readwise',
            'google-calendar-sync': 'Calendar',
            'google-contacts-sync': 'Contacts',
            'telegram-sync': 'Telegram',
        };
        return names[pluginId] || pluginId;
    }

    /**
     * Handle status bar click
     */
    onStatusBarClick() {
        this.syncAll();
    }

    /**
     * Sync all enabled plugins
     */
    async syncAll() {
        try {
            const records = await this.myCollection?.getAllRecords() || [];
            const enabledRecords = records.filter(r => r.prop('enabled')?.choice() === 'yes');

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
     * Reset any stuck syncs
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
