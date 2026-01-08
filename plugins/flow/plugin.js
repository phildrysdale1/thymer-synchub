const VERSION = 'v1.2.5';
/**
 * Flow - Your Focus Companion
 *
 * CSS: Load flow.css in Thymer's Custom CSS settings
 *
 * An AppPlugin that provides focus session tracking with three visibility modes:
 * 1. Status Bar - Minimal: [● Task 23:45]
 * 2. Compact - Floating card with timer, progress, next task
 * 3. Full - Side panel with timeline, controls, unscheduled tasks
 *
 * Consumes from:
 * - window.plannerHub (required) - tasks, scheduling, status
 * - window.calendarHub (optional) - calendar events in timeline
 * - window.musicHub (future) - focus music integration
 */

class Plugin extends AppPlugin {
    async onLoad() {
        // Initialize state
        this.mode = 'status'; // 'status' | 'compact' | 'full'
        this.session = null;  // { taskGuid, task, startTime, pausedTime, totalPausedMs, isPaused }
        this.timerInterval = null;
        this.overlay = null;
        this.statusBarItem = null;

        // Planning view state
        this.hourRangeMode = 'normal'; // 'normal' (9-17), 'extended' (7-21), 'full' (0-23)
        this.hourRanges = {
            normal: { start: 9, end: 17 },
            extended: { start: 7, end: 21 },
            full: { start: 0, end: 23 }
        };

        // Wait for plannerHub to be available
        if (window.plannerHub) {
            this.initialize();
        } else {
            // Wait a bit for plannerHub
            const checkInterval = setInterval(() => {
                if (window.plannerHub) {
                    clearInterval(checkInterval);
                    this.initialize();
                }
            }, 100);
            // Timeout after 5 seconds - initialize anyway
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!this.initialized) {
                    this.initialize();
                }
            }, 5000);
        }
    }

    initialize() {
        if (this.initialized) return;
        this.initialized = true;

        // Setup status bar
        this.setupStatusBar();

        // Expose API
        this.exposeAPI();

        // Check for PlannerHub
        this.checkDependencies();

        console.log(`[Flow] Loaded ${VERSION}`);
    }

    checkDependencies() {
        if (!window.plannerHub) {
            console.warn('[Flow] PlannerHub not found - some features disabled');
        }
        if (window.calendarHub) {
            console.log('[Flow] Calendar integration available');
        }
    }

    // =========================================================================
    // API (window.flow)
    // =========================================================================

    exposeAPI() {
        window.flow = {
            version: VERSION,

            // Session control
            startSession: (taskGuid) => this.startSession(taskGuid),
            pauseSession: () => this.pauseSession(),
            resumeSession: () => this.resumeSession(),
            endSession: () => this.endSession(),

            // State
            getSession: () => this.session ? { ...this.session } : null,
            isActive: () => !!this.session && !this.session.isPaused,
            isPaused: () => !!this.session?.isPaused,

            // Mode
            setMode: (mode) => this.setMode(mode),
            getMode: () => this.mode,

            // UI
            show: () => this.showOverlay(),
            hide: () => this.hideOverlay(),
            toggle: () => this.overlay ? this.hideOverlay() : this.showOverlay(),
        };

        console.log('[Flow] API exposed at window.flow');
    }

    // =========================================================================
    // Status Bar
    // =========================================================================

    setupStatusBar() {
        this.statusBarItem = this.ui.addStatusBarItem({
            htmlLabel: this.buildStatusBarLabel(),
            tooltip: 'Flow - Click to expand',
            onClick: () => this.handleStatusBarClick()
        });

        // Update every second when active
        setInterval(() => this.updateStatusBar(), 1000);
    }

    buildStatusBarLabel() {
        const dotClass = this.session
            ? (this.session.isPaused ? 'paused' : 'active')
            : '';
        const timeClass = this.session?.isPaused ? 'paused' : '';

        if (!this.session) {
            return `
                <span class="flow-status-bar">
                    <span class="flow-status-dot"></span>
                    <span class="flow-status-task" style="color: var(--text-muted);">No active session</span>
                </span>
            `;
        }

        const elapsed = this.getElapsedTime();
        const timeStr = this.formatTime(elapsed);
        const taskLabel = this.session.task ? this.formatTaskTitle(this.session.task) : 'Working...';

        return `
            <span class="flow-status-bar">
                <span class="flow-status-dot ${dotClass}"></span>
                <span class="flow-status-task">${taskLabel}</span>
                <span class="flow-status-time ${timeClass}">${timeStr}</span>
            </span>
        `;
    }

    updateStatusBar() {
        if (this.statusBarItem) {
            this.statusBarItem.setHtmlLabel(this.buildStatusBarLabel());

            const tooltip = this.session
                ? `${this.session.task?.text || this.session.task?.linkedIssueTitle || 'Working'} - ${this.session.isPaused ? 'Paused' : 'In progress'}`
                : 'Flow - Click to start a session';
            this.statusBarItem.setTooltip(tooltip);
        }

        // Also update overlay if visible
        if (this.overlay) {
            this.updateOverlayTimer();
        }
    }

    handleStatusBarClick() {
        if (this.overlay) {
            // Cycle through modes or close
            if (this.mode === 'compact') {
                this.setMode('full');
            } else {
                this.hideOverlay();
            }
        } else {
            this.setMode('compact');
            this.showOverlay();
        }
    }

    // =========================================================================
    // Session Management
    // =========================================================================

    async startSession(taskGuid = null) {
        let task = { text: 'Focus session', linkedIssueTitle: null };
        let actualGuid = taskGuid;

        // If no task specified, get the next one from PlannerHub
        if (!taskGuid && window.plannerHub) {
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const nextTask = tasks.find(t => t.status !== 'done');
            if (nextTask) {
                actualGuid = nextTask.guid;
                task = { text: nextTask.text, linkedIssueTitle: nextTask.linkedIssueTitle };
            }
        } else if (taskGuid && window.plannerHub) {
            // Get task details
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const foundTask = tasks.find(t => t.guid === taskGuid);
            if (foundTask) {
                task = { text: foundTask.text, linkedIssueTitle: foundTask.linkedIssueTitle };
            }
        }

        // Mark as in progress
        if (actualGuid && window.plannerHub) {
            await window.plannerHub.markInProgress(actualGuid);
        }

        this.session = {
            taskGuid: actualGuid,
            task, // Store full task object for formatTaskTitle
            startTime: Date.now(),
            pausedTime: null,
            totalPausedMs: 0,
            isPaused: false
        };

        const taskLabel = task.text || task.linkedIssueTitle || 'Task';
        console.log(`[Flow] Session started: ${taskLabel}`);
        this.updateStatusBar();
        if (this.overlay) this.renderOverlay();

        return true;
    }

    pauseSession() {
        if (!this.session || this.session.isPaused) return false;

        this.session.isPaused = true;
        this.session.pausedTime = Date.now();

        console.log('[Flow] Session paused');
        this.updateStatusBar();
        if (this.overlay) this.renderOverlay();

        return true;
    }

    resumeSession() {
        if (!this.session || !this.session.isPaused) return false;

        const pausedDuration = Date.now() - this.session.pausedTime;
        this.session.totalPausedMs += pausedDuration;
        this.session.isPaused = false;
        this.session.pausedTime = null;

        console.log('[Flow] Session resumed');
        this.updateStatusBar();
        if (this.overlay) this.renderOverlay();

        return true;
    }

    async endSession() {
        if (!this.session) return false;

        // Mark as done
        if (this.session.taskGuid && window.plannerHub) {
            await window.plannerHub.markDone(this.session.taskGuid);
        }

        const elapsed = this.getElapsedTime();
        console.log(`[Flow] Session ended: ${this.formatTime(elapsed)}`);

        this.session = null;
        this.updateStatusBar();
        if (this.overlay) this.renderOverlay();

        return true;
    }

    getElapsedTime() {
        if (!this.session) return 0;

        let elapsed = Date.now() - this.session.startTime - this.session.totalPausedMs;

        if (this.session.isPaused) {
            elapsed -= (Date.now() - this.session.pausedTime);
        }

        return Math.max(0, elapsed);
    }

    // =========================================================================
    // Overlay UI
    // =========================================================================

    setMode(mode) {
        this.mode = mode;
        if (this.overlay) {
            this.renderOverlay();
        }
    }

    showOverlay() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'flow-overlay';
        document.body.appendChild(this.overlay);

        this.renderOverlay();
    }

    hideOverlay() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    async renderOverlay() {
        if (!this.overlay) return;

        if (this.mode === 'compact') {
            await this.renderCompactOverlay();
        } else if (this.mode === 'full') {
            await this.renderFullOverlay();
        }

        this.wireOverlayEvents();
    }

    async renderCompactOverlay() {
        const elapsed = this.getElapsedTime();
        const timeStr = this.formatTime(elapsed);
        const progress = Math.min((elapsed / (60 * 60 * 1000)) * 100, 100); // 1hr = 100%
        const circumference = 126; // 2 * PI * 20
        const offset = circumference - (progress / 100 * circumference);

        const statusClass = this.session
            ? (this.session.isPaused ? 'paused' : '')
            : 'idle';
        const statusText = this.session
            ? (this.session.isPaused ? 'Paused' : 'Working')
            : 'Idle';

        // Get next task
        let nextTask = null;
        if (window.plannerHub && this.session) {
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const currentIndex = tasks.findIndex(t => t.guid === this.session.taskGuid);
            if (currentIndex >= 0 && currentIndex < tasks.length - 1) {
                nextTask = tasks[currentIndex + 1];
            }
        }

        if (!this.session) {
            // Idle state - show task picker
            await this.renderIdleCompact();
            return;
        }

        this.overlay.innerHTML = `
            <div class="flow-compact">
                <div class="flow-compact-header">
                    <div class="flow-compact-status">
                        <div class="flow-compact-status-dot ${statusClass}"></div>
                        <span class="flow-compact-status-text ${statusClass}">${statusText}</span>
                    </div>
                    <div class="flow-compact-controls">
                        <button class="flow-compact-btn" data-action="expand" title="Expand">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>
                <div class="flow-compact-body">
                    <div class="flow-compact-task">${this.formatTaskTitle(this.session.task, 30)}</div>
                    <div class="flow-compact-source">Focus session</div>

                    <div class="flow-compact-timer">
                        <div class="flow-compact-timer-ring">
                            <svg viewBox="0 0 48 48">
                                <circle class="ring-bg" cx="24" cy="24" r="20"/>
                                <circle class="ring-progress" cx="24" cy="24" r="20" style="stroke-dashoffset: ${offset}"/>
                            </svg>
                            <div class="flow-compact-timer-value">${Math.round(progress)}%</div>
                        </div>
                        <div class="flow-compact-timer-info">
                            <div class="flow-compact-timer-elapsed">${timeStr}</div>
                            <div class="flow-compact-timer-label">elapsed</div>
                        </div>
                    </div>

                    <div class="flow-compact-progress">
                        <div class="flow-compact-progress-bar" style="width: ${progress}%"></div>
                    </div>

                    ${nextTask ? `
                        <div class="flow-compact-next">
                            <div class="flow-compact-next-info">
                                <div class="flow-compact-next-label">Next</div>
                                <div class="flow-compact-next-task">${this.formatTaskTitle(nextTask, 25)}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="flow-compact-footer">
                    ${this.session.isPaused ? `
                        <button class="flow-compact-action start" data-action="resume">
                            <span class="ti ti-player-play"></span>
                            Resume
                        </button>
                    ` : `
                        <button class="flow-compact-action" data-action="pause">
                            <span class="ti ti-player-pause"></span>
                            Pause
                        </button>
                    `}
                    <button class="flow-compact-action primary" data-action="complete">
                        <span class="ti ti-check"></span>
                        Complete
                    </button>
                </div>
            </div>
        `;
    }

    async renderIdleCompact() {
        let tasks = [];
        if (window.plannerHub) {
            tasks = await window.plannerHub.getPlannerHubTasks();
            tasks = tasks.filter(t => t.status !== 'done').slice(0, 5);
        }

        this.overlay.innerHTML = `
            <div class="flow-compact">
                <div class="flow-compact-header">
                    <div class="flow-compact-status">
                        <div class="flow-compact-status-dot idle"></div>
                        <span class="flow-compact-status-text idle">Ready</span>
                    </div>
                    <div class="flow-compact-controls">
                        <button class="flow-compact-btn" data-action="expand" title="Expand">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>
                <div class="flow-compact-body">
                    ${tasks.length > 0 ? `
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                            Pick a task to start:
                        </div>
                        <div class="flow-task-picker">
                            ${tasks.map(t => `
                                <div class="flow-task-picker-item" data-action="start-task" data-guid="${t.guid}">
                                    <div class="flow-task-picker-item-title">${this.formatTaskTitle(t)}</div>
                                    <div class="flow-task-picker-item-meta">${t.status}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="flow-idle-message">
                            <div class="flow-idle-icon"><span class="ti ti-flame"></span></div>
                            <div class="flow-idle-text">No tasks in PlannerHub</div>
                        </div>
                    `}
                </div>
                ${tasks.length > 0 ? `
                    <div class="flow-compact-footer">
                        <button class="flow-compact-action start" data-action="start-next" style="flex: 1; border: none;">
                            <span class="ti ti-player-play"></span>
                            Start Next Task
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async renderFullOverlay() {
        // Get data from PlannerHub
        let backlogTasks = [];
        let scheduledItems = [];
        let calendarEvents = [];

        if (window.plannerHub) {
            // Get unscheduled tasks for backlog
            const unscheduled = await window.plannerHub.getUnscheduledTasks();
            backlogTasks = unscheduled.filter(t => t.status !== 'done');

            // Get timeline view for scheduled items
            const timeline = await window.plannerHub.getTimelineView({
                workdayStart: '07:00',
                workdayEnd: '21:00',
                includeCalendar: !!window.calendarHub
            });

            // Separate calendar events and tasks
            scheduledItems = timeline.filter(t => t.type !== 'calendar');
            calendarEvents = timeline.filter(t => t.type === 'calendar');
        }

        // Auto-select hour range based on current time AND scheduled items
        this.autoSelectHourRange(scheduledItems, calendarEvents);

        // Get current time info for "now" line
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Session info
        const elapsed = this.getElapsedTime();
        const timeStr = this.formatTime(elapsed);
        const isIdle = !this.session;
        const isPaused = this.session?.isPaused;

        this.overlay.innerHTML = `
            <div class="flow-planner">
                <!-- Header -->
                <div class="flow-planner-header">
                    <div class="flow-planner-title">
                        <span class="ti ti-flame flow-planner-title-icon"></span>
                        Flow
                    </div>
                    <div class="flow-compact-controls">
                        <button class="flow-compact-btn" data-action="compact" title="Compact view">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></svg>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>

                <!-- Main Content -->
                <div class="flow-planner-main">
                    <!-- Backlog Panel -->
                    <div class="flow-backlog">
                        <div class="flow-section-header">
                            <span class="flow-section-title">
                                <span class="ti ti-stack-2"></span>
                                Now
                            </span>
                            <span class="flow-section-count">${backlogTasks.length}</span>
                            ${backlogTasks.length > 0 ? `
                                <div class="flow-section-actions">
                                    <button class="flow-add-all-btn" data-action="add-all" title="Float all tasks into calendar">
                                        <span class="ti ti-playlist-add"></span>
                                        Add all
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="flow-backlog-list">
                            ${backlogTasks.length > 0 ? backlogTasks.map(t => this.renderBacklogTask(t)).join('') : `
                                <div class="flow-backlog-empty">
                                    <div class="flow-backlog-empty-icon"><span class="ti ti-checkbox"></span></div>
                                    <div class="flow-backlog-empty-text">All tasks scheduled!</div>
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Calendar Panel -->
                    <div class="flow-calendar">
                        <div class="flow-calendar-header">
                            <span class="flow-calendar-date">
                                <span class="ti ti-calendar"></span>
                                Today
                            </span>
                        </div>
                        <div class="flow-calendar-pill">
                            <button class="flow-calendar-pill-btn ${this.hourRangeMode === 'normal' ? 'active' : ''}" data-action="hour-range" data-mode="normal">9-17</button>
                            <button class="flow-calendar-pill-btn ${this.hourRangeMode === 'extended' ? 'active' : ''}" data-action="hour-range" data-mode="extended">7-21</button>
                            <button class="flow-calendar-pill-btn ${this.hourRangeMode === 'full' ? 'active' : ''}" data-action="hour-range" data-mode="full">24h</button>
                        </div>
                        <div class="flow-calendar-slots">
                            ${this.renderCalendarSlots(scheduledItems, calendarEvents, currentHour, currentMinute)}
                        </div>
                    </div>
                </div>

                <!-- Active Session Bar -->
                <div class="flow-active-bar ${isIdle ? 'idle' : ''}">
                    <div class="flow-active-indicator"></div>
                    <div class="flow-active-info">
                        <div class="flow-active-label">${isIdle ? 'Ready to start' : (isPaused ? 'Paused' : 'Working on')}</div>
                        <div class="flow-active-task">
                            ${isIdle ? 'Pick a task from the backlog' : this.formatTaskTitle(this.session.task)}
                        </div>
                    </div>
                    <div class="flow-active-timer">${isIdle ? '--:--' : timeStr}</div>
                    <div class="flow-active-controls">
                        ${isIdle ? `
                            ${backlogTasks.length > 0 ? `
                                <button class="flow-active-btn start" data-action="start-next">
                                    <span class="ti ti-player-play"></span>
                                    Start
                                </button>
                            ` : ''}
                        ` : `
                            ${isPaused ? `
                                <button class="flow-active-btn" data-action="resume">
                                    <span class="ti ti-player-play"></span>
                                    Resume
                                </button>
                            ` : `
                                <button class="flow-active-btn" data-action="pause">
                                    <span class="ti ti-player-pause"></span>
                                    Pause
                                </button>
                            `}
                            <button class="flow-active-btn complete" data-action="complete">
                                <span class="ti ti-check"></span>
                                Done
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Auto-select hour range mode based on current time AND scheduled tasks
     */
    autoSelectHourRange(scheduledItems = [], calendarEvents = []) {
        const currentHour = new Date().getHours();

        // Find earliest and latest hours from all items
        let minHour = currentHour;
        let maxHour = currentHour;

        const allItems = [...scheduledItems, ...calendarEvents];
        for (const item of allItems) {
            if (item.start) {
                const hour = item.start.getHours();
                minHour = Math.min(minHour, hour);
                maxHour = Math.max(maxHour, hour);
            }
        }

        // Select mode based on the range needed
        if (minHour < 7 || maxHour > 21) {
            this.hourRangeMode = 'full';
        } else if (minHour < 9 || maxHour > 17) {
            this.hourRangeMode = 'extended';
        }
        // Otherwise keep current mode (default is 'normal')
    }

    /**
     * Render a backlog task card
     */
    renderBacklogTask(task) {
        const estimate = task.estimate || '30m'; // Default estimate
        const isFloating = !task.scheduledStart; // No explicit schedule = floating
        const statusClass = task.status === 'in-progress' ? 'in-progress' : (task.status === 'next' ? 'next' : 'todo');

        return `
            <div class="flow-task-card ${isFloating ? 'floating' : ''}" draggable="true" data-guid="${task.guid}">
                <button class="flow-task-estimate" data-action="estimate" data-guid="${task.guid}" title="Click to change estimate">${estimate}</button>
                <div class="flow-task-content">
                    <div class="flow-task-title">${this.formatTaskTitle(task)}</div>
                    <div class="flow-task-meta">
                        <span class="flow-task-status">
                            <span class="flow-task-status-dot ${statusClass}"></span>
                            ${task.status || 'todo'}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render calendar slots with tasks and "now" line
     */
    renderCalendarSlots(scheduledTasks, calendarEvents, currentHour, currentMinute) {
        const range = this.hourRanges[this.hourRangeMode];
        const slots = [];

        // Build lookup for scheduled items by hour
        const itemsByHour = {};
        for (const task of scheduledTasks) {
            if (task.start) {
                const hour = task.start.getHours();
                if (!itemsByHour[hour]) itemsByHour[hour] = [];
                itemsByHour[hour].push({ ...task, type: 'task' });
            }
        }
        for (const event of calendarEvents) {
            if (event.start) {
                const hour = event.start.getHours();
                if (!itemsByHour[hour]) itemsByHour[hour] = [];
                itemsByHour[hour].push({ ...event, type: 'calendar' });
            }
        }

        for (let h = range.start; h <= range.end; h++) {
            const hourStr = h.toString().padStart(2, '0') + ':00';
            const items = itemsByHour[h] || [];
            const isNowHour = h === currentHour;
            const nowOffset = isNowHour ? (currentMinute / 60) * 100 : 0;

            let contentHtml;
            if (items.length > 0) {
                const item = items[0]; // Show first item in slot
                const isCalendar = item.type === 'calendar';
                const isFloating = item.type === 'task' && !item.pinned;
                const isActive = this.session?.taskGuid === item.guid;
                const title = this.formatTaskTitle(item);
                const timeLabel = item.end
                    ? `${this.formatHourMin(item.start)} - ${this.formatHourMin(item.end)}`
                    : (item.estimate || '');

                contentHtml = `
                    <div class="flow-slot-content">
                        <div class="flow-slot-task ${isCalendar ? 'calendar-event' : ''} ${isFloating ? 'floating' : ''} ${isActive ? 'active' : ''}"
                             data-guid="${item.guid}" data-action="start-task">
                            <div class="flow-slot-task-title">${title}</div>
                            ${timeLabel ? `<div class="flow-slot-task-time">${timeLabel}</div>` : ''}
                        </div>
                    </div>
                `;
            } else {
                contentHtml = '<div class="flow-slot-content empty"></div>';
            }

            // "Now" line
            const nowLineHtml = isNowHour ? `
                <div class="flow-now-line" style="top: ${nowOffset}%">
                    <div class="flow-now-dot"></div>
                </div>
            ` : '';

            slots.push(`
                <div class="flow-calendar-slot ${isNowHour ? 'has-now' : ''}">
                    <div class="flow-slot-hour">${hourStr}</div>
                    ${contentHtml}
                    ${nowLineHtml}
                </div>
            `);
        }

        return slots.join('');
    }

    /**
     * Format Date to HH:MM
     */
    formatHourMin(date) {
        if (!date) return '';
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    updateOverlayTimer() {
        if (!this.overlay || !this.session) return;

        const elapsed = this.getElapsedTime();
        const timeStr = this.formatTime(elapsed);
        const progress = Math.min((elapsed / (60 * 60 * 1000)) * 100, 100);

        // Update compact timer
        const elapsedEl = this.overlay.querySelector('.flow-compact-timer-elapsed');
        if (elapsedEl) elapsedEl.textContent = timeStr;

        const percentEl = this.overlay.querySelector('.flow-compact-timer-value');
        if (percentEl) percentEl.textContent = Math.round(progress) + '%';

        const progressBar = this.overlay.querySelector('.flow-compact-progress-bar');
        if (progressBar) progressBar.style.width = progress + '%';

        const ringProgress = this.overlay.querySelector('.ring-progress');
        if (ringProgress) {
            const circumference = 126;
            const offset = circumference - (progress / 100 * circumference);
            ringProgress.style.strokeDashoffset = offset;
        }

        // Update planning view active bar timer
        const activeTimer = this.overlay.querySelector('.flow-active-timer');
        if (activeTimer) activeTimer.textContent = timeStr;
    }

    wireOverlayEvents() {
        if (!this.overlay) return;

        this.overlay.addEventListener('click', async (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;

            const action = actionEl.dataset.action;

            switch (action) {
                case 'close':
                    this.hideOverlay();
                    break;
                case 'expand':
                    this.setMode('full');
                    break;
                case 'compact':
                    this.setMode('compact');
                    break;
                case 'pause':
                    this.pauseSession();
                    break;
                case 'resume':
                    this.resumeSession();
                    break;
                case 'complete':
                    await this.endSession();
                    break;
                case 'start-next':
                    await this.startSession();
                    break;
                case 'start-task':
                    const guid = actionEl.dataset.guid;
                    await this.startSession(guid);
                    break;
                case 'hour-range':
                    this.hourRangeMode = actionEl.dataset.mode;
                    this.renderOverlay();
                    break;
                case 'add-all':
                    await this.addAllToCalendar();
                    break;
                case 'estimate':
                    this.showEstimateDropdown(actionEl, actionEl.dataset.guid);
                    break;
            }
        });
    }

    /**
     * Add all unscheduled tasks as floating items in the calendar
     */
    async addAllToCalendar() {
        if (!window.plannerHub) return;

        const unscheduled = await window.plannerHub.getUnscheduledTasks();
        const tasks = unscheduled.filter(t => t.status !== 'done');

        // For Phase 1, we just log this - actual scheduling comes in Phase 2
        console.log(`[Flow] Add all: ${tasks.length} tasks would be floated into calendar`);

        // Re-render to show updated state
        this.renderOverlay();
    }

    /**
     * Show estimate dropdown for a task
     */
    showEstimateDropdown(buttonEl, taskGuid) {
        // Remove existing dropdown
        const existing = document.querySelector('.flow-estimate-dropdown');
        if (existing) existing.remove();

        const rect = buttonEl.getBoundingClientRect();
        const dropdown = document.createElement('div');
        dropdown.className = 'flow-estimate-dropdown';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;

        const options = ['15m', '30m', '1h', '2h', '4h'];
        dropdown.innerHTML = `
            ${options.map(opt => `
                <div class="flow-estimate-option" data-estimate="${opt}">${opt}</div>
            `).join('')}
            <div class="flow-estimate-custom">
                <input type="text" placeholder="e.g. 90" title="Enter minutes">
            </div>
        `;

        document.body.appendChild(dropdown);

        // Handle option clicks
        dropdown.addEventListener('click', async (e) => {
            const optionEl = e.target.closest('.flow-estimate-option');
            if (optionEl) {
                const estimate = optionEl.dataset.estimate;
                await this.setTaskEstimate(taskGuid, estimate);
                dropdown.remove();
            }
        });

        // Handle custom input
        const input = dropdown.querySelector('input');
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const minutes = parseInt(input.value, 10);
                if (minutes > 0) {
                    const estimate = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? minutes % 60 + 'm' : ''}` : `${minutes}m`;
                    await this.setTaskEstimate(taskGuid, estimate);
                    dropdown.remove();
                }
            } else if (e.key === 'Escape') {
                dropdown.remove();
            }
        });

        // Close on outside click
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== buttonEl) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);

        input.focus();
    }

    /**
     * Set estimate for a task (Phase 1: just update UI, Phase 2: persist)
     */
    async setTaskEstimate(taskGuid, estimate) {
        console.log(`[Flow] Set estimate for ${taskGuid}: ${estimate}`);
        // Phase 1: Just re-render, actual persistence comes in Phase 2
        this.renderOverlay();
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.slice(0, len) + '...' : str;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format task title with linked issue in teal (matches PlannerHub).
     * @param {Object} task - Task object with text and linkedIssueTitle
     * @param {number} [maxLen] - Optional max length for truncation
     * @returns {string} HTML string
     */
    formatTaskTitle(task, maxLen = null) {
        let html = '';

        if (task.text) {
            const text = maxLen ? this.truncate(task.text, maxLen) : task.text;
            html = this.escapeHtml(text);
        }

        if (task.linkedIssueTitle) {
            const title = maxLen ? this.truncate(task.linkedIssueTitle, maxLen) : task.linkedIssueTitle;
            const linkedHtml = `<span class="flow-link">${this.escapeHtml(title)}</span>`;
            html += (html ? ' ' : '') + linkedHtml;
        }

        if (!html) {
            html = '<span style="color: var(--text-muted); font-style: italic;">Untitled task</span>';
        }

        return html;
    }
}
