const VERSION = 'v1.3.0';
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
        this.planningRefreshInterval = null; // 5-minute refresh for "now" line and floating tasks
        this.hourRanges = {
            normal: { start: 9, end: 17 },
            extended: { start: 7, end: 21 },
            full: { start: 0, end: 23 }
        };

        // Drag-drop state (Phase 2)
        this.pinnedSlots = new Map(); // taskGuid → Date (pinned time)
        this.draggedTask = null; // Currently dragged task

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
        this.startPlanningRefresh();
    }

    /**
     * Start 5-minute refresh interval for planning view
     * Updates "now" line position and floating task placement
     */
    startPlanningRefresh() {
        this.stopPlanningRefresh();
        // Refresh every 5 minutes (300000ms)
        this.planningRefreshInterval = setInterval(() => {
            if (this.overlay && this.mode === 'full') {
                console.log('[Flow] Refreshing planning view');
                this.renderOverlay();
            }
        }, 5 * 60 * 1000);
    }

    stopPlanningRefresh() {
        if (this.planningRefreshInterval) {
            clearInterval(this.planningRefreshInterval);
            this.planningRefreshInterval = null;
        }
    }

    hideOverlay() {
        this.stopPlanningRefresh();
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
        // Clean data model:
        // - pinnedTasks: tasks with explicit scheduled time (Phase 2)
        // - floatingTasks: tasks without schedule, stack after "now"
        // - calendarEvents: from calendar, always have fixed times
        let pinnedTasks = [];
        let floatingTasks = [];
        let calendarEvents = [];

        if (window.plannerHub) {
            // Get all incomplete tasks
            const allTasks = await window.plannerHub.getPlannerHubTasks();
            const incompleteTasks = allTasks.filter(t => t.status !== 'done');

            // Split into pinned vs floating based on pinnedSlots map
            for (const task of incompleteTasks) {
                const pinnedSlot = this.pinnedSlots.get(task.guid);
                if (pinnedSlot) {
                    pinnedTasks.push({ ...task, pinnedSlot });
                } else {
                    floatingTasks.push(task);
                }
            }

            // Get calendar events from timeline (only calendar type)
            if (window.calendarHub) {
                const timeline = await window.plannerHub.getTimelineView({
                    workdayStart: '07:00',
                    workdayEnd: '21:00',
                    includeCalendar: true
                });
                calendarEvents = timeline.filter(t => t.type === 'calendar');
            }
        }

        // Auto-select hour range based on current time and calendar events
        this.autoSelectHourRange(pinnedTasks, calendarEvents);

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
                            <span class="flow-section-count">${floatingTasks.length}</span>
                            ${floatingTasks.length > 0 ? `
                                <div class="flow-section-actions">
                                    <button class="flow-add-all-btn" data-action="add-all" title="Float all tasks into calendar">
                                        <span class="ti ti-playlist-add"></span>
                                        Add all
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="flow-backlog-list">
                            ${floatingTasks.length > 0 ? floatingTasks.map(t => this.renderBacklogTask(t)).join('') : `
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
                            ${this.renderCalendarSlots(pinnedTasks, calendarEvents, floatingTasks, currentHour, currentMinute)}
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
                            ${floatingTasks.length > 0 ? `
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
     * Render calendar with layered architecture:
     * 1. Grid layer - static hour slots (background)
     * 2. Tasks layer - absolutely positioned tasks (overlay)
     * 3. Now line - positioned at current time
     *
     * Data model:
     * - pinnedTasks: have explicit pinnedSlot (Phase 2)
     * - calendarEvents: from calendar, have start/end
     * - floatingTasks: no schedule, stack after "now"
     */
    renderCalendarSlots(pinnedTasks, calendarEvents, floatingTasks, currentHour, currentMinute) {
        const range = this.hourRanges[this.hourRangeMode];
        const totalHours = range.end - range.start + 1;
        const totalMinutes = totalHours * 60;

        // 1. Render static hour grid (background)
        let gridHtml = '';
        for (let h = range.start; h <= range.end; h++) {
            const hourStr = h.toString().padStart(2, '0') + ':00';
            gridHtml += `
                <div class="flow-calendar-slot">
                    <div class="flow-slot-hour">${hourStr}</div>
                </div>
            `;
        }

        // 2. Calculate "now" position in minutes from range start
        const nowMinutes = (currentHour - range.start) * 60 + currentMinute;
        const nowPercent = Math.max(0, Math.min(100, (nowMinutes / totalMinutes) * 100));
        const showNowLine = currentHour >= range.start && currentHour <= range.end;

        const nowLineHtml = showNowLine ? `
            <div class="flow-now-line" style="top: ${nowPercent}%">
                <div class="flow-now-label">NOW</div>
                <div class="flow-now-dot"></div>
            </div>
        ` : '';

        // 3. Build render list
        let tasksHtml = '';

        // Pinned tasks - rendered at their explicit slot time (Phase 2)
        for (const task of pinnedTasks) {
            const slot = task.pinnedSlot; // Date object
            if (!slot) continue;

            const startMin = (slot.getHours() - range.start) * 60 + slot.getMinutes();
            const topPct = (startMin / totalMinutes) * 100;
            const durationMin = this.estimateToMinutes(task.estimate) || 30;
            const heightPct = (durationMin / totalMinutes) * 100;

            tasksHtml += this.renderCalendarTask(task, topPct, heightPct, false, false);
        }

        // Calendar events - rendered at their fixed times
        for (const event of calendarEvents) {
            if (!event.start) continue;

            const startMin = (event.start.getHours() - range.start) * 60 + event.start.getMinutes();
            const topPct = (startMin / totalMinutes) * 100;
            let durationMin = 60; // default 1hr
            if (event.end) {
                durationMin = (event.end - event.start) / 60000;
            }
            const heightPct = (durationMin / totalMinutes) * 100;

            tasksHtml += this.renderCalendarTask(event, topPct, heightPct, false, true);
        }

        // Floating tasks - stack sequentially starting at "now"
        // Minimum spacing to prevent visual overlap (CSS min-height issue)
        const minSlotMinutes = 45;
        let floatStartMin = Math.max(0, nowMinutes); // Start at now (or 0 if now is before range)
        for (const task of floatingTasks) {
            if (floatStartMin >= totalMinutes) break; // Past end of visible range

            const topPct = (floatStartMin / totalMinutes) * 100;
            const durationMin = this.estimateToMinutes(task.estimate) || 30;
            const heightPct = (durationMin / totalMinutes) * 100;

            tasksHtml += this.renderCalendarTask(task, topPct, heightPct, true, false);

            // Advance position by at least minSlotMinutes to prevent overlap
            floatStartMin += Math.max(durationMin, minSlotMinutes);
        }

        return `
            <div class="flow-calendar-grid">
                ${gridHtml}
            </div>
            ${nowLineHtml}
            <div class="flow-calendar-tasks">
                ${tasksHtml}
            </div>
        `;
    }

    /**
     * Render a single task positioned absolutely on the calendar
     */
    renderCalendarTask(item, topPct, heightPct, isFloating, isCalendar) {
        const isActive = this.session?.taskGuid === item.guid;
        const title = this.formatTaskTitle(item);
        const timeLabel = item.pinnedSlot
            ? this.formatHourMin(item.pinnedSlot)
            : (item.estimate ? `~${item.estimate}` : '');

        // Tasks are draggable, calendar events are not
        const draggable = !isCalendar ? 'draggable="true"' : '';

        return `
            <div class="flow-calendar-task ${isFloating ? 'floating' : ''} ${isCalendar ? 'calendar-event' : ''} ${isActive ? 'active' : ''}"
                 style="top: ${topPct}%; height: ${heightPct}%;"
                 data-guid="${item.guid}" data-action="start-task" ${draggable}>
                <div class="flow-calendar-task-title">${title}</div>
                ${timeLabel ? `<div class="flow-calendar-task-time">${timeLabel}</div>` : ''}
            </div>
        `;
    }

    /**
     * Convert estimate string to minutes
     */
    estimateToMinutes(estimate) {
        if (!estimate) return 30;
        const match = estimate.match(/(\d+)([hm])/);
        if (!match) return 30;
        const num = parseInt(match[1], 10);
        return match[2] === 'h' ? num * 60 : num;
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

        // Click handlers
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

        // Drag-drop handlers for task scheduling
        this.wireDragDropEvents();
    }

    /**
     * Wire up drag-drop events for scheduling tasks
     */
    wireDragDropEvents() {
        if (!this.overlay) return;

        const calendarSlots = this.overlay.querySelector('.flow-calendar-slots');
        if (!calendarSlots) return;

        // Drag start on task cards
        this.overlay.addEventListener('dragstart', (e) => {
            const taskCard = e.target.closest('.flow-task-card, .flow-calendar-task');
            if (!taskCard) return;

            const guid = taskCard.dataset.guid;
            this.draggedTask = { guid, element: taskCard };
            taskCard.classList.add('dragging');

            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', guid);

            console.log(`[Flow] Drag start: ${guid}`);
        });

        // Drag end
        this.overlay.addEventListener('dragend', (e) => {
            const taskCard = e.target.closest('.flow-task-card, .flow-calendar-task');
            if (taskCard) {
                taskCard.classList.remove('dragging');
            }
            this.draggedTask = null;

            // Remove any drop indicators
            calendarSlots.querySelectorAll('.drop-indicator').forEach(el => el.remove());
            calendarSlots.classList.remove('drag-over');
        });

        // Drag over calendar - allow drop and show indicator
        calendarSlots.addEventListener('dragover', (e) => {
            if (!this.draggedTask) return;

            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            calendarSlots.classList.add('drag-over');

            // Update drop indicator position
            this.updateDropIndicator(calendarSlots, e.clientY);
        });

        // Drag leave
        calendarSlots.addEventListener('dragleave', (e) => {
            // Only remove if leaving the container entirely
            if (!calendarSlots.contains(e.relatedTarget)) {
                calendarSlots.classList.remove('drag-over');
                calendarSlots.querySelectorAll('.drop-indicator').forEach(el => el.remove());
            }
        });

        // Drop - pin task to time slot
        calendarSlots.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.draggedTask) return;

            const time = this.calculateDropTime(calendarSlots, e.clientY);
            if (time) {
                this.pinTaskToSlot(this.draggedTask.guid, time);
            }

            calendarSlots.classList.remove('drag-over');
            calendarSlots.querySelectorAll('.drop-indicator').forEach(el => el.remove());
        });
    }

    /**
     * Update the drop indicator line position
     */
    updateDropIndicator(container, clientY) {
        let indicator = container.querySelector('.drop-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            container.appendChild(indicator);
        }

        const rect = container.getBoundingClientRect();
        const relativeY = clientY - rect.top + container.scrollTop;
        indicator.style.top = `${relativeY}px`;

        // Calculate and show time
        const time = this.calculateDropTime(container, clientY);
        if (time) {
            const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
            indicator.dataset.time = timeStr;
        }
    }

    /**
     * Calculate the time from drop position
     */
    calculateDropTime(container, clientY) {
        const rect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;
        const relativeY = clientY - rect.top + scrollTop;
        const containerHeight = container.scrollHeight;

        const range = this.hourRanges[this.hourRangeMode];
        const totalMinutes = (range.end - range.start + 1) * 60;

        // Calculate minutes from start of range
        const minutesFromStart = (relativeY / containerHeight) * totalMinutes;

        // Snap to 15-minute intervals
        const snappedMinutes = Math.round(minutesFromStart / 15) * 15;

        // Convert to time
        const hours = range.start + Math.floor(snappedMinutes / 60);
        const minutes = snappedMinutes % 60;

        // Create Date for today with this time
        const now = new Date();
        const dropTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

        return dropTime;
    }

    /**
     * Pin a task to a specific time slot
     */
    pinTaskToSlot(taskGuid, time) {
        console.log(`[Flow] Pinning task ${taskGuid} to ${time.toLocaleTimeString()}`);

        this.pinnedSlots.set(taskGuid, time);

        // Re-render to show updated positions
        this.renderOverlay();
    }

    /**
     * Unpin a task (return to floating)
     */
    unpinTask(taskGuid) {
        console.log(`[Flow] Unpinning task ${taskGuid}`);

        this.pinnedSlots.delete(taskGuid);
        this.renderOverlay();
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
