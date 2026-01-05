const VERSION = 'v1.0.1';
/**
 * Desktop Bridge Plugin
 *
 * Connects Thymer to thymer-bar for MCP (Model Context Protocol) and CLI integration.
 * This is a service plugin - it doesn't sync data, it provides connectivity.
 *
 * Features:
 * - WebSocket connection to thymer-bar (ws://127.0.0.1:9848)
 * - MCP status bar with activity indicator
 * - Tool call forwarding to LLM clients
 * - Live activity log
 */

class Plugin extends AppPlugin {
    async onLoad() {
        // Wait for SyncHub to be ready
        window.addEventListener('synchub-ready', () => this.initialize());
        if (window.syncHub) {
            this.initialize();
        }
    }

    async initialize() {
        // Avoid double initialization
        if (this.initialized) return;
        this.initialized = true;

        console.log('[DesktopBridge] Initializing...');

        // State
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.intentionalClose = false;
        this.connectedAt = null;
        this.activityLog = []; // Circular buffer of recent tool calls

        // MCP status bar (wand icon)
        this.statusBarItem = this.ui.addStatusBarItem({
            htmlLabel: this.buildLabel(false),
            tooltip: 'MCP disconnected - Click to connect',
            onClick: (event) => this.onStatusBarClick(event)
        });

        // Connect to thymer-bar
        this.connect();
    }

    onUnload() {
        this.disconnect();
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
        if (this.popup) {
            this.popup.remove();
        }
        if (this.activityPopup) {
            this.activityPopup.remove();
        }
    }

    // =========================================================================
    // WebSocket Connection
    // =========================================================================

    connect() {
        if (typeof WebSocket === 'undefined') return;

        // Don't connect if already connected/connecting
        if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
            console.debug('[DesktopBridge] Already connected, skipping');
            return;
        }

        const wsUrl = 'ws://127.0.0.1:9848';
        this.reconnectAttempts = 0;
        this.intentionalClose = false;

        this._connect(wsUrl);
    }

    _connect(wsUrl) {
        if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
            return;
        }

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[DesktopBridge] Connected to thymer-bar');
                this.reconnectAttempts = 0;
                this.connectedAt = new Date();

                // Register ourselves
                this.ws.send(JSON.stringify({
                    type: 'register',
                    version: '1.0.0'
                }));

                // Push tools and plugins
                this._pushTools();
                this._pushPlugins();

                // Update status bar
                this.updateStatusBar();
            };

            this.ws.onmessage = (event) => {
                this._handleMessage(event.data);
            };

            this.ws.onclose = (event) => {
                console.log('[DesktopBridge] Disconnected from thymer-bar');
                const wasIntentional = this.intentionalClose;
                this.ws = null;
                this.connectedAt = null;

                this.updateStatusBar();

                // Don't reconnect if intentional or replaced by new client
                if (wasIntentional || event.code === 1008) {
                    console.debug('[DesktopBridge] Not reconnecting (intentional or replaced)');
                    return;
                }

                // Reconnect with exponential backoff
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                    this.reconnectAttempts++;
                    console.debug(`[DesktopBridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
                    setTimeout(() => this._connect(wsUrl), delay);
                }
            };

            this.ws.onerror = () => {
                // Silent - thymer-bar might not be running
                console.debug('[DesktopBridge] Connection error (app may not be running)');
            };

        } catch (e) {
            console.debug('[DesktopBridge] Could not connect:', e.message);
        }
    }

    disconnect() {
        if (this.ws) {
            this.intentionalClose = true;
            this.ws.close(1000, 'Plugin unloading');
            this.ws = null;
        }
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    // =========================================================================
    // Message Handling
    // =========================================================================

    _handleMessage(data) {
        try {
            const msg = JSON.parse(data);

            switch (msg.type) {
                case 'get_tools':
                    this._sendResponse(msg.id, window.syncHub.getRegisteredTools());
                    break;

                case 'get_plugins':
                    this._sendResponse(msg.id, window.syncHub.getPlugins());
                    break;

                case 'tool_call':
                    this._handleToolCall(msg);
                    break;

                case 'sync':
                    window.syncHub.requestSync(msg.plugin)
                        .then(() => this._sendResponse(msg.id, { success: true }))
                        .catch(err => this._sendError(msg.id, err.message));
                    break;

                case 'sync_all':
                    window.syncHub.syncAll()
                        .then(() => this._sendResponse(msg.id, { success: true }))
                        .catch(err => this._sendError(msg.id, err.message));
                    break;

                default:
                    console.debug('[DesktopBridge] Unknown message type:', msg.type);
            }
        } catch (e) {
            console.error('[DesktopBridge] Failed to handle message:', e);
        }
    }

    _handleToolCall(msg) {
        this.flashActivity();

        const callStart = Date.now();
        const logEntry = {
            id: msg.id,
            tool: msg.name,
            args: msg.args || {},
            timestamp: new Date(),
            status: 'pending'
        };

        // Add to activity log (circular buffer)
        this.activityLog.unshift(logEntry);
        if (this.activityLog.length > 50) this.activityLog.pop();
        this.updateActivityPopup();

        // Execute via SyncHub
        window.syncHub.executeToolCall(msg.name, msg.args || {})
            .then(result => {
                logEntry.status = 'success';
                logEntry.duration = Date.now() - callStart;
                this.updateActivityPopup();
                this._sendResponse(msg.id, result);
            })
            .catch(err => {
                logEntry.status = 'error';
                logEntry.error = err.message;
                logEntry.duration = Date.now() - callStart;
                this.updateActivityPopup();
                this._sendError(msg.id, err.message);
            });
    }

    _sendResponse(id, result) {
        if (!this.isConnected()) return;
        this.ws.send(JSON.stringify({ id, result }));
    }

    _sendError(id, error) {
        if (!this.isConnected()) return;
        this.ws.send(JSON.stringify({ id, error }));
    }

    _pushTools() {
        if (!this.isConnected()) return;
        this.ws.send(JSON.stringify({
            type: 'tools',
            tools: window.syncHub.getRegisteredTools()
        }));
    }

    _pushPlugins() {
        if (!this.isConnected()) return;
        this.ws.send(JSON.stringify({
            type: 'plugins',
            plugins: window.syncHub.getPlugins()
        }));
    }

    // =========================================================================
    // Status Bar UI
    // =========================================================================

    buildLabel(connected, active = false) {
        const baseStyle = 'font-size: 16px;';

        if (connected) {
            if (active) {
                return `<style>
                    @keyframes mcpGlow {
                        0% { filter: drop-shadow(0 0 2px #a78bfa); }
                        100% { filter: drop-shadow(0 0 8px #a78bfa) drop-shadow(0 0 12px #a78bfa); }
                    }
                </style>
                <span class="ti ti-wand" style="${baseStyle} color: #a78bfa; animation: mcpGlow 0.15s ease-out;"></span>`;
            }
            return `<span class="ti ti-wand" style="${baseStyle} color: #a78bfa;"></span>`;
        } else {
            return `<span class="ti ti-wand" style="${baseStyle} opacity: 0.3;"></span>`;
        }
    }

    flashActivity() {
        if (!this.statusBarItem || !this.isConnected()) return;

        this.statusBarItem.setHtmlLabel(this.buildLabel(true, true));

        clearTimeout(this.flashTimeout);
        this.flashTimeout = setTimeout(() => {
            if (this.isConnected()) {
                this.statusBarItem.setHtmlLabel(this.buildLabel(true, false));
            }
        }, 150);
    }

    updateStatusBar() {
        if (!this.statusBarItem) return;

        const connected = this.isConnected();
        this.statusBarItem.setHtmlLabel(this.buildLabel(connected));

        if (connected) {
            const toolCount = window.syncHub.getRegisteredTools().length;
            const duration = this.connectedAt
                ? this.formatRelativeTime(this.connectedAt)
                : 'just now';
            this.statusBarItem.setTooltip(`MCP connected (${toolCount} tools) - Connected ${duration}`);
        } else {
            this.statusBarItem.setTooltip('MCP disconnected - Click to connect this window');
        }
    }

    formatRelativeTime(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    // =========================================================================
    // Popup Menu
    // =========================================================================

    onStatusBarClick(event) {
        this.showPopup(event);
    }

    showPopup(event) {
        this.closePopup();

        const connected = this.isConnected();
        const toolCount = window.syncHub.getRegisteredTools().length;
        const duration = this.connectedAt ? this.formatRelativeTime(this.connectedAt) : '';

        const options = [];

        // Status header
        options.push({ type: 'heading', label: 'MCP Status' });

        // Connection status
        if (connected) {
            options.push({
                type: 'info',
                icon: 'ti-circle-check',
                iconColor: 'var(--text-status-online)',
                label: `Connected (${toolCount} tools)`
            });
            options.push({
                type: 'info',
                label: `Connected ${duration}`
            });
        } else {
            options.push({
                type: 'info',
                icon: 'ti-circle-x',
                iconColor: 'var(--text-status-offline)',
                label: 'Disconnected'
            });
        }

        options.push({ type: 'divider' });

        // Actions
        if (connected) {
            options.push({
                type: 'action',
                icon: 'ti-refresh',
                label: 'Reconnect',
                action: () => this.connect()
            });
            options.push({
                type: 'action',
                icon: 'ti-plug-off',
                label: 'Disconnect',
                action: () => this.disconnect()
            });
            options.push({
                type: 'action',
                icon: 'ti-list',
                label: 'Show Tools (console)',
                action: () => {
                    console.log('[MCP] Registered tools:', window.syncHub.getRegisteredTools().map(t => t.function?.name || t.name));
                }
            });
        } else {
            options.push({
                type: 'action',
                icon: 'ti-plug',
                label: 'Connect',
                action: () => this.connect()
            });
        }

        options.push({ type: 'divider' });
        options.push({
            type: 'action',
            icon: 'ti-activity',
            label: 'Activity Log',
            action: () => this.showActivityPopup()
        });

        this.popup = this.createPopup(options, event);
    }

    createPopup(options, event) {
        const popup = document.createElement('div');
        popup.className = 'desktop-bridge-popup';
        popup.style.cssText = `
            position: fixed;
            width: 260px;
            z-index: 9999;
            background: var(--background-primary);
            border: 1px solid var(--divider-color);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            padding: 8px 0;
            font-size: 13px;
        `;

        const rect = event?.target?.getBoundingClientRect?.();
        if (rect) {
            popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            popup.style.left = `${Math.max(10, rect.left - 100)}px`;
        } else {
            popup.style.bottom = '50px';
            popup.style.right = '20px';
        }

        let html = '';
        for (const opt of options) {
            if (opt.type === 'heading') {
                html += `<div style="padding: 6px 12px; font-weight: 600; color: var(--text-muted); font-size: 11px; text-transform: uppercase;">${opt.label}</div>`;
            } else if (opt.type === 'info') {
                const iconHtml = opt.icon
                    ? `<span class="ti ${opt.icon}" style="margin-right: 8px; ${opt.iconColor ? `color: ${opt.iconColor};` : ''}"></span>`
                    : '<span style="width: 24px; display: inline-block;"></span>';
                html += `<div style="padding: 6px 12px; display: flex; align-items: center;">${iconHtml}<span>${opt.label}</span></div>`;
            } else if (opt.type === 'divider') {
                html += `<div style="border-top: 1px solid var(--divider-color); margin: 6px 0;"></div>`;
            } else if (opt.type === 'action') {
                const iconHtml = opt.icon ? `<span class="ti ${opt.icon}" style="margin-right: 8px;"></span>` : '<span style="width: 24px; display: inline-block;"></span>';
                html += `<div class="autocomplete--option desktop-bridge-action" data-label="${opt.label}" style="padding: 6px 12px; display: flex; align-items: center; cursor: pointer;">${iconHtml}<span>${opt.label}</span></div>`;
            }
        }

        popup.innerHTML = html;

        // Add click handlers
        popup.querySelectorAll('.desktop-bridge-action').forEach(el => {
            const label = el.dataset.label;
            const opt = options.find(o => o.type === 'action' && o.label === label);

            el.addEventListener('click', () => {
                opt?.action?.();
                this.closePopup();
            });

            el.addEventListener('mouseenter', () => el.classList.add('autocomplete--option-selected'));
            el.addEventListener('mouseleave', () => el.classList.remove('autocomplete--option-selected'));
        });

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', this._popupCloseHandler = (e) => {
                if (!popup.contains(e.target)) {
                    this.closePopup();
                }
            });
        }, 100);

        document.body.appendChild(popup);
        return popup;
    }

    closePopup() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
        if (this._popupCloseHandler) {
            document.removeEventListener('click', this._popupCloseHandler);
            this._popupCloseHandler = null;
        }
    }

    // =========================================================================
    // Activity Log
    // =========================================================================

    showActivityPopup() {
        if (this.activityPopup) {
            this.activityPopup.remove();
            this.activityPopup = null;
            return;
        }

        const popup = document.createElement('div');
        popup.className = 'desktop-bridge-activity';
        popup.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 50px;
            width: 400px;
            max-height: 350px;
            z-index: 9999;
            background: var(--background-primary);
            border: 1px solid var(--divider-color);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 12px;
            overflow: hidden;
        `;

        popup.innerHTML = `
            <div style="padding: 8px 12px; border-bottom: 1px solid var(--divider-color); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600;"><span class="ti ti-activity" style="margin-right: 6px;"></span>MCP Activity</span>
                <span class="ti ti-x desktop-bridge-close" style="cursor: pointer; opacity: 0.6;"></span>
            </div>
            <div class="desktop-bridge-log" style="max-height: 300px; overflow-y: auto; padding: 4px 0;"></div>
        `;

        popup.querySelector('.desktop-bridge-close').addEventListener('click', () => {
            this.activityPopup.remove();
            this.activityPopup = null;
        });

        document.body.appendChild(popup);
        this.activityPopup = popup;
        this.updateActivityPopup();
    }

    updateActivityPopup() {
        if (!this.activityPopup) return;

        const logEl = this.activityPopup.querySelector('.desktop-bridge-log');
        if (!logEl) return;

        if (this.activityLog.length === 0) {
            logEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No activity yet</div>';
            return;
        }

        let html = '';
        for (const entry of this.activityLog.slice(0, 20)) {
            const statusIcon = entry.status === 'success' ? 'ti-check'
                : entry.status === 'error' ? 'ti-x'
                : 'ti-loader';
            const statusColor = entry.status === 'success' ? 'var(--text-status-online)'
                : entry.status === 'error' ? 'var(--text-status-offline)'
                : 'var(--text-muted)';
            const statusAnim = entry.status === 'pending' ? 'animation: spin 1s linear infinite;' : '';

            const argsStr = JSON.stringify(entry.args);
            const argsShort = argsStr.length > 40 ? argsStr.slice(0, 40) + '...' : argsStr;
            const durationStr = entry.duration ? `${entry.duration}ms` : '';

            html += `
                <div style="padding: 6px 12px; border-bottom: 1px solid var(--divider-color); display: flex; align-items: center; gap: 8px;" title="${this.escapeHtml(argsStr)}${entry.error ? '\n\nError: ' + this.escapeHtml(entry.error) : ''}">
                    <span class="ti ${statusIcon}" style="color: ${statusColor}; ${statusAnim} flex-shrink: 0;"></span>
                    <span style="flex: 1; overflow: hidden;">
                        <span style="font-weight: 500;">${entry.tool}</span>
                        <span style="color: var(--text-muted); margin-left: 4px;">${this.escapeHtml(argsShort)}</span>
                    </span>
                    <span style="color: var(--text-muted); font-size: 10px; flex-shrink: 0;">${durationStr}</span>
                </div>
            `;
        }

        logEl.innerHTML = html;
    }

    escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
