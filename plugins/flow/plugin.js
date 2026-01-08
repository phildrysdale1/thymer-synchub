const VERSION = 'v1.3.6';
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
        this.planningRefreshInterval = null;
        this.hourRanges = {
            normal: { start: 9, end: 17 },
            extended: { start: 7, end: 21 },
            full: { start: 0, end: 23 }
        };

        // Task scheduling state
        this.pinnedSlots = new Map(); // taskGuid → Date (pinned time)
        this.taskEstimates = new Map(); // taskGuid → minutes (override estimates)
        this.hidePlanned = false; // Toggle to hide planned tasks from backlog

        // Unified interaction state (drag or resize)
        this.interaction = null; // { type: 'drag'|'resize', taskGuid, ... }
        this.dragPreview = null; // Floating card during drag
        this.dragGhost = null; // Ghost showing drop target

        // Wait for plannerHub to be available
        if (window.plannerHub) {
            this.initialize();
        } else {
            const checkInterval = setInterval(() => {
                if (window.plannerHub) {
                    clearInterval(checkInterval);
                    this.initialize();
                }
            }, 100);
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

        this.setupStatusBar();
        this.exposeAPI();
        this.checkDependencies();
        this.setupGlobalMouseHandlers();

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

    /**
     * Setup global mouse handlers for drag and resize (once, on document)
     */
    setupGlobalMouseHandlers() {
        document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
    }

    handleGlobalMouseMove(e) {
        if (!this.interaction) return;

        if (this.interaction.type === 'drag') {
            this.updateDragPreview(e.clientX, e.clientY);
            this.updateDragGhost(e.clientY);
        } else if (this.interaction.type === 'resize') {
            this.updateResizePreview(e.clientY);
        }
    }

    handleGlobalMouseUp(e) {
        if (!this.interaction) return;

        if (this.interaction.type === 'drag') {
            this.completeDrag(e.clientY);
        } else if (this.interaction.type === 'resize') {
            this.completeResize(e.clientY);
        }

        this.interaction = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // =========================================================================
    // API (window.flow)
    // =========================================================================

    exposeAPI() {
        window.flow = {
            version: VERSION,
            startSession: (taskGuid) => this.startSession(taskGuid),
            pauseSession: () => this.pauseSession(),
            resumeSession: () => this.resumeSession(),
            endSession: () => this.endSession(),
            getSession: () => this.session ? { ...this.session } : null,
            isActive: () => !!this.session && !this.session.isPaused,
            isPaused: () => !!this.session?.isPaused,
            setMode: (mode) => this.setMode(mode),
            getMode: () => this.mode,
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
        if (this.overlay) {
            this.updateOverlayTimer();
        }
    }

    handleStatusBarClick() {
        if (this.overlay) {
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

        if (!taskGuid && window.plannerHub) {
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const nextTask = tasks.find(t => t.status !== 'done');
            if (nextTask) {
                actualGuid = nextTask.guid;
                task = { text: nextTask.text, linkedIssueTitle: nextTask.linkedIssueTitle };
            }
        } else if (taskGuid && window.plannerHub) {
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const foundTask = tasks.find(t => t.guid === taskGuid);
            if (foundTask) {
                task = { text: foundTask.text, linkedIssueTitle: foundTask.linkedIssueTitle };
            }
        }

        if (actualGuid && window.plannerHub) {
            await window.plannerHub.markInProgress(actualGuid);
        }

        this.session = {
            taskGuid: actualGuid,
            task,
            startTime: Date.now(),
            pausedTime: null,
            totalPausedMs: 0,
            isPaused: false
        };

        console.log(`[Flow] Session started: ${task.text || task.linkedIssueTitle || 'Task'}`);
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

    startPlanningRefresh() {
        this.stopPlanningRefresh();
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
        const progress = Math.min((elapsed / (60 * 60 * 1000)) * 100, 100);
        const circumference = 126;
        const offset = circumference - (progress / 100 * circumference);

        const statusClass = this.session ? (this.session.isPaused ? 'paused' : '') : 'idle';
        const statusText = this.session ? (this.session.isPaused ? 'Paused' : 'Working') : 'Idle';

        let nextTask = null;
        if (window.plannerHub && this.session) {
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const currentIndex = tasks.findIndex(t => t.guid === this.session.taskGuid);
            if (currentIndex >= 0 && currentIndex < tasks.length - 1) {
                nextTask = tasks[currentIndex + 1];
            }
        }

        if (!this.session) {
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
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>
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
                            <span class="ti ti-player-play"></span> Resume
                        </button>
                    ` : `
                        <button class="flow-compact-action" data-action="pause">
                            <span class="ti ti-player-pause"></span> Pause
                        </button>
                    `}
                    <button class="flow-compact-action primary" data-action="complete">
                        <span class="ti ti-check"></span> Complete
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
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>
                <div class="flow-compact-body">
                    ${tasks.length > 0 ? `
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Pick a task to start:</div>
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
                            <span class="ti ti-player-play"></span> Start Next Task
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async renderFullOverlay() {
        let pinnedTasks = [];
        let floatingTasks = [];
        let calendarEvents = [];

        if (window.plannerHub) {
            const allTasks = await window.plannerHub.getPlannerHubTasks();
            const incompleteTasks = allTasks.filter(t => t.status !== 'done');

            for (const task of incompleteTasks) {
                const pinnedSlot = this.pinnedSlots.get(task.guid);
                if (pinnedSlot) {
                    pinnedTasks.push({ ...task, pinnedSlot });
                } else {
                    floatingTasks.push(task);
                }
            }

            if (window.calendarHub) {
                const timeline = await window.plannerHub.getTimelineView({
                    workdayStart: '07:00',
                    workdayEnd: '21:00',
                    includeCalendar: true
                });
                calendarEvents = timeline.filter(t => t.type === 'calendar');
            }
        }

        this.autoSelectHourRange(pinnedTasks, calendarEvents);

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const elapsed = this.getElapsedTime();
        const timeStr = this.formatTime(elapsed);
        const isIdle = !this.session;
        const isPaused = this.session?.isPaused;

        // Build backlog list based on hidePlanned toggle
        const backlogTasks = this.hidePlanned
            ? floatingTasks
            : [...floatingTasks, ...pinnedTasks];

        this.overlay.innerHTML = `
            <div class="flow-planner">
                <div class="flow-planner-header">
                    <div class="flow-planner-title">
                        <span class="ti ti-flame flow-planner-title-icon"></span>
                        Flow
                    </div>
                    <div class="flow-compact-controls">
                        <button class="flow-compact-btn" data-action="compact" title="Compact view">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></svg>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>

                <div class="flow-planner-main">
                    <div class="flow-backlog">
                        <div class="flow-section-header">
                            <span class="flow-section-title">
                                <span class="ti ti-stack-2"></span>
                                Now
                            </span>
                            <span class="flow-section-count">${floatingTasks.length + pinnedTasks.length}</span>
                            <div class="flow-section-actions">
                                <button class="flow-hide-planned-btn ${this.hidePlanned ? 'active' : ''}" data-action="toggle-hide-planned" title="${this.hidePlanned ? 'Show planned' : 'Hide planned'}">
                                    <span class="ti ti-${this.hidePlanned ? 'eye' : 'eye-off'}"></span>
                                    ${this.hidePlanned ? 'Show' : 'Hide'} planned
                                </button>
                            </div>
                        </div>
                        <div class="flow-backlog-list">
                            ${backlogTasks.length > 0 ? backlogTasks.map(t => this.renderBacklogTask(t)).join('') : `
                                <div class="flow-backlog-empty">
                                    <div class="flow-backlog-empty-icon"><span class="ti ti-checkbox"></span></div>
                                    <div class="flow-backlog-empty-text">${this.hidePlanned ? 'All remaining tasks planned!' : 'All tasks scheduled!'}</div>
                                </div>
                            `}
                        </div>
                    </div>

                    <div class="flow-calendar">
                        <div class="flow-calendar-header">
                            <span class="flow-calendar-date"><span class="ti ti-calendar"></span> Today</span>
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

                <div class="flow-active-bar ${isIdle ? 'idle' : ''}">
                    <div class="flow-active-indicator"></div>
                    <div class="flow-active-info">
                        <div class="flow-active-label">${isIdle ? 'Ready to start' : (isPaused ? 'Paused' : 'Working on')}</div>
                        <div class="flow-active-task">${isIdle ? 'Pick a task from the backlog' : this.formatTaskTitle(this.session.task)}</div>
                    </div>
                    <div class="flow-active-timer">${isIdle ? '--:--' : timeStr}</div>
                    <div class="flow-active-controls">
                        ${isIdle ? `
                            ${floatingTasks.length > 0 ? `<button class="flow-active-btn start" data-action="start-next"><span class="ti ti-player-play"></span> Start</button>` : ''}
                        ` : `
                            ${isPaused ? `
                                <button class="flow-active-btn" data-action="resume"><span class="ti ti-player-play"></span> Resume</button>
                            ` : `
                                <button class="flow-active-btn" data-action="pause"><span class="ti ti-player-pause"></span> Pause</button>
                            `}
                            <button class="flow-active-btn complete" data-action="complete"><span class="ti ti-check"></span> Done</button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    autoSelectHourRange(scheduledItems = [], calendarEvents = []) {
        const currentHour = new Date().getHours();
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

        if (minHour < 7 || maxHour > 21) {
            this.hourRangeMode = 'full';
        } else if (minHour < 9 || maxHour > 17) {
            this.hourRangeMode = 'extended';
        }
    }

    renderBacklogTask(task) {
        const estimate = this.getTaskEstimateStr(task.guid) || task.estimate || '30m';
        const isPinned = this.pinnedSlots.has(task.guid);
        const isFloating = !isPinned;
        const statusClass = task.status === 'in-progress' ? 'in-progress' : (task.status === 'next' ? 'next' : 'todo');

        let pinnedTimeStr = '';
        if (isPinned) {
            const slot = this.pinnedSlots.get(task.guid);
            pinnedTimeStr = this.formatHourMin(slot);
        }

        return `
            <div class="flow-task-card ${isFloating ? 'floating' : ''}" data-guid="${task.guid}" data-draggable="true">
                <button class="flow-task-estimate" data-action="estimate" data-guid="${task.guid}" title="Click to change estimate">${estimate}</button>
                <div class="flow-task-content">
                    <div class="flow-task-title">${this.formatTaskTitle(task)}</div>
                    <div class="flow-task-meta">
                        <span class="flow-task-status">
                            <span class="flow-task-status-dot ${statusClass}"></span>
                            ${task.status || 'todo'}
                        </span>
                        ${isPinned ? `<span class="flow-task-planned-badge"><span class="ti ti-clock"></span> ${pinnedTimeStr}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    renderCalendarSlots(pinnedTasks, calendarEvents, floatingTasks, currentHour, currentMinute) {
        const range = this.hourRanges[this.hourRangeMode];
        const totalHours = range.end - range.start + 1;
        const totalMinutes = totalHours * 60;

        // Grid
        let gridHtml = '';
        for (let h = range.start; h <= range.end; h++) {
            const hourStr = h.toString().padStart(2, '0') + ':00';
            gridHtml += `<div class="flow-calendar-slot"><div class="flow-slot-hour">${hourStr}</div></div>`;
        }

        // Now line
        const nowMinutes = (currentHour - range.start) * 60 + currentMinute;
        const nowPercent = Math.max(0, Math.min(100, (nowMinutes / totalMinutes) * 100));
        const showNowLine = currentHour >= range.start && currentHour <= range.end;

        const nowLineHtml = showNowLine ? `
            <div class="flow-now-line" style="top: ${nowPercent}%">
                <div class="flow-now-label">NOW</div>
                <div class="flow-now-dot"></div>
            </div>
        ` : '';

        // Tasks
        let tasksHtml = '';

        // Pinned tasks
        for (const task of pinnedTasks) {
            const slot = task.pinnedSlot;
            if (!slot) continue;
            const startMin = (slot.getHours() - range.start) * 60 + slot.getMinutes();
            const topPct = (startMin / totalMinutes) * 100;
            const durationMin = this.getTaskEstimate(task.guid);
            const heightPct = (durationMin / totalMinutes) * 100;
            tasksHtml += this.renderCalendarTask(task, topPct, heightPct, false, false);
        }

        // Calendar events
        for (const event of calendarEvents) {
            if (!event.start) continue;
            const startMin = (event.start.getHours() - range.start) * 60 + event.start.getMinutes();
            const topPct = (startMin / totalMinutes) * 100;
            let durationMin = 60;
            if (event.end) durationMin = (event.end - event.start) / 60000;
            const heightPct = (durationMin / totalMinutes) * 100;
            tasksHtml += this.renderCalendarTask(event, topPct, heightPct, false, true);
        }

        // Floating tasks
        const minSlotMinutes = 45;
        let floatStartMin = Math.max(0, nowMinutes);
        for (const task of floatingTasks) {
            if (floatStartMin >= totalMinutes) break;
            const topPct = (floatStartMin / totalMinutes) * 100;
            const durationMin = this.getTaskEstimate(task.guid);
            const heightPct = (durationMin / totalMinutes) * 100;
            tasksHtml += this.renderCalendarTask(task, topPct, heightPct, true, false);
            floatStartMin += Math.max(durationMin, minSlotMinutes);
        }

        return `
            <div class="flow-calendar-grid">${gridHtml}</div>
            ${nowLineHtml}
            <div class="flow-calendar-tasks">${tasksHtml}</div>
        `;
    }

    renderCalendarTask(item, topPct, heightPct, isFloating, isCalendar) {
        const isActive = this.session?.taskGuid === item.guid;
        const title = this.formatTaskTitle(item);
        const timeLabel = item.pinnedSlot
            ? this.formatHourMin(item.pinnedSlot)
            : (item.estimate ? `~${item.estimate}` : '');

        const draggable = !isCalendar ? 'data-draggable="true"' : '';

        return `
            <div class="flow-calendar-task ${isFloating ? 'floating' : ''} ${isCalendar ? 'calendar-event' : ''} ${isActive ? 'active' : ''}"
                 style="top: ${topPct}%; height: ${heightPct}%;"
                 data-guid="${item.guid}" data-action="start-task" ${draggable}>
                <div class="flow-calendar-task-title">${title}</div>
                ${timeLabel ? `<div class="flow-calendar-task-time">${timeLabel}</div>` : ''}
                ${!isCalendar ? '<div class="flow-resize-handle" data-resize="true"></div>' : ''}
            </div>
        `;
    }

    // =========================================================================
    // Event Wiring
    // =========================================================================

    wireOverlayEvents() {
        if (!this.overlay) return;

        // Click handlers
        this.overlay.addEventListener('click', async (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;

            // Don't handle click if we just finished a drag/resize
            if (e.target.closest('[data-draggable]') && this.justFinishedInteraction) {
                return;
            }

            const action = actionEl.dataset.action;

            switch (action) {
                case 'close': this.hideOverlay(); break;
                case 'expand': this.setMode('full'); break;
                case 'compact': this.setMode('compact'); break;
                case 'pause': this.pauseSession(); break;
                case 'resume': this.resumeSession(); break;
                case 'complete': await this.endSession(); break;
                case 'start-next': await this.startSession(); break;
                case 'start-task':
                    const guid = actionEl.dataset.guid;
                    await this.startSession(guid);
                    break;
                case 'hour-range':
                    this.hourRangeMode = actionEl.dataset.mode;
                    this.renderOverlay();
                    break;
                case 'toggle-hide-planned':
                    this.hidePlanned = !this.hidePlanned;
                    this.renderOverlay();
                    break;
                case 'estimate':
                    this.showEstimateDropdown(actionEl, actionEl.dataset.guid);
                    break;
            }
        });

        // Mousedown for drag/resize
        this.overlay.addEventListener('mousedown', (e) => {
            // Check for resize handle first
            const resizeHandle = e.target.closest('[data-resize]');
            if (resizeHandle) {
                this.startResize(e, resizeHandle);
                return;
            }

            // Check for draggable task (but not on buttons)
            if (e.target.closest('button')) return;

            const draggable = e.target.closest('[data-draggable]');
            if (draggable) {
                this.startDrag(e, draggable);
            }
        });
    }

    // =========================================================================
    // Drag Implementation (mouse-based)
    // =========================================================================

    startDrag(e, element) {
        e.preventDefault();

        const guid = element.dataset.guid;
        const isFromBacklog = element.classList.contains('flow-task-card');
        const title = element.querySelector('.flow-task-title, .flow-calendar-task-title')?.textContent || 'Task';
        const rect = element.getBoundingClientRect();

        this.interaction = {
            type: 'drag',
            taskGuid: guid,
            element,
            isFromBacklog,
            title,
            startX: e.clientX,
            startY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            hasMoved: false
        };

        element.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        console.log(`[Flow] Drag start: ${guid}`);
    }

    updateDragPreview(clientX, clientY) {
        if (!this.interaction || this.interaction.type !== 'drag') return;

        // Check if we've moved enough to consider it a drag
        const dx = clientX - this.interaction.startX;
        const dy = clientY - this.interaction.startY;
        if (!this.interaction.hasMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

        this.interaction.hasMoved = true;

        // Create/update floating preview for backlog drags
        if (this.interaction.isFromBacklog) {
            if (!this.dragPreview) {
                this.dragPreview = document.createElement('div');
                this.dragPreview.className = 'flow-drag-preview';
                this.dragPreview.innerHTML = this.interaction.element.innerHTML;
                document.body.appendChild(this.dragPreview);
            }
            this.dragPreview.style.left = `${clientX - this.interaction.offsetX}px`;
            this.dragPreview.style.top = `${clientY - this.interaction.offsetY}px`;
        }
    }

    updateDragGhost(clientY) {
        if (!this.interaction || this.interaction.type !== 'drag') return;
        if (!this.interaction.hasMoved) return;

        const calendarSlots = this.overlay?.querySelector('.flow-calendar-slots');
        if (!calendarSlots) return;

        const rect = calendarSlots.getBoundingClientRect();

        // Only show ghost if mouse is over calendar
        if (clientY < rect.top || clientY > rect.bottom) {
            this.removeDragGhost();
            return;
        }

        calendarSlots.classList.add('drag-over');

        // Create ghost if needed
        if (!this.dragGhost) {
            this.dragGhost = document.createElement('div');
            this.dragGhost.className = 'drop-ghost';
            calendarSlots.querySelector('.flow-calendar-tasks')?.appendChild(this.dragGhost);
        }

        // Calculate position
        const time = this.calculateDropTime(calendarSlots, clientY);
        if (!time) return;

        const range = this.hourRanges[this.hourRangeMode];
        const totalMinutes = (range.end - range.start + 1) * 60;
        const startMin = (time.getHours() - range.start) * 60 + time.getMinutes();
        const topPct = (startMin / totalMinutes) * 100;
        const durationMin = this.getTaskEstimate(this.interaction.taskGuid);
        const heightPct = (durationMin / totalMinutes) * 100;

        // Time range
        const endTime = new Date(time.getTime() + durationMin * 60000);
        const startStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
        const endStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`;

        this.dragGhost.style.top = `${topPct}%`;
        this.dragGhost.style.height = `${heightPct}%`;

        if (this.interaction.isFromBacklog) {
            this.dragGhost.innerHTML = `<div class="drop-ghost-time">${startStr} → ${endStr}</div>`;
            this.dragGhost.classList.add('slot-only');
        } else {
            this.dragGhost.innerHTML = `
                <div class="drop-ghost-title">${this.interaction.title}</div>
                <div class="drop-ghost-time">${startStr} → ${endStr}</div>
            `;
            this.dragGhost.classList.remove('slot-only');
        }
    }

    removeDragGhost() {
        if (this.dragGhost) {
            this.dragGhost.remove();
            this.dragGhost = null;
        }
        this.overlay?.querySelector('.flow-calendar-slots')?.classList.remove('drag-over');
    }

    completeDrag(clientY) {
        if (!this.interaction || this.interaction.type !== 'drag') return;

        // Clean up preview
        if (this.dragPreview) {
            this.dragPreview.remove();
            this.dragPreview = null;
        }

        this.interaction.element.classList.remove('dragging');

        // Only pin if we actually moved
        if (this.interaction.hasMoved) {
            const calendarSlots = this.overlay?.querySelector('.flow-calendar-slots');
            if (calendarSlots) {
                const rect = calendarSlots.getBoundingClientRect();
                if (clientY >= rect.top && clientY <= rect.bottom) {
                    const time = this.calculateDropTime(calendarSlots, clientY);
                    if (time) {
                        this.pinTaskToSlot(this.interaction.taskGuid, time);
                    }
                }
            }
            this.justFinishedInteraction = true;
            setTimeout(() => { this.justFinishedInteraction = false; }, 100);
        }

        this.removeDragGhost();
    }

    // =========================================================================
    // Resize Implementation
    // =========================================================================

    startResize(e, handle) {
        e.preventDefault();
        e.stopPropagation();

        const taskEl = handle.closest('.flow-calendar-task');
        if (!taskEl) return;

        const guid = taskEl.dataset.guid;
        const rect = taskEl.getBoundingClientRect();
        const calendarSlots = this.overlay.querySelector('.flow-calendar-slots');

        this.interaction = {
            type: 'resize',
            taskGuid: guid,
            element: taskEl,
            startY: e.clientY,
            startHeight: rect.height,
            startEstimate: this.getTaskEstimate(guid),
            containerRect: calendarSlots.getBoundingClientRect(),
            containerHeight: calendarSlots.scrollHeight
        };

        taskEl.classList.add('resizing');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';

        console.log(`[Flow] Resize start: ${guid}, estimate: ${this.interaction.startEstimate}m`);
    }

    updateResizePreview(clientY) {
        if (!this.interaction || this.interaction.type !== 'resize') return;

        const { element, startY, startHeight, startEstimate, containerHeight } = this.interaction;
        const deltaY = clientY - startY;

        // Calculate new height
        const newHeight = Math.max(28, startHeight + deltaY);
        element.style.height = `${newHeight}px`;

        // Calculate new estimate
        const range = this.hourRanges[this.hourRangeMode];
        const totalMinutes = (range.end - range.start + 1) * 60;
        const minutesPerPixel = totalMinutes / containerHeight;
        const newMinutes = Math.round((newHeight * minutesPerPixel) / 15) * 15;
        const clampedMinutes = Math.max(15, Math.min(480, newMinutes));

        // Show duration label
        let label = element.querySelector('.flow-resize-label');
        if (!label) {
            label = document.createElement('div');
            label.className = 'flow-resize-label';
            element.appendChild(label);
        }
        label.textContent = clampedMinutes >= 60
            ? `${Math.floor(clampedMinutes / 60)}h${clampedMinutes % 60 > 0 ? clampedMinutes % 60 + 'm' : ''}`
            : `${clampedMinutes}m`;

        this.interaction.newEstimate = clampedMinutes;
    }

    completeResize(clientY) {
        if (!this.interaction || this.interaction.type !== 'resize') return;

        const { taskGuid, element, newEstimate } = this.interaction;

        // Remove label
        element.querySelector('.flow-resize-label')?.remove();
        element.classList.remove('resizing');

        // Save estimate if changed
        if (newEstimate && newEstimate !== this.interaction.startEstimate) {
            this.taskEstimates.set(taskGuid, newEstimate);
            console.log(`[Flow] Resize complete: ${taskGuid}, ${this.interaction.startEstimate}m → ${newEstimate}m`);
        }

        // Re-render to fix height
        this.renderOverlay();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    calculateDropTime(container, clientY) {
        const rect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;
        const relativeY = clientY - rect.top + scrollTop;
        const containerHeight = container.scrollHeight;

        const range = this.hourRanges[this.hourRangeMode];
        const totalMinutes = (range.end - range.start + 1) * 60;
        const minutesFromStart = (relativeY / containerHeight) * totalMinutes;
        const snappedMinutes = Math.round(minutesFromStart / 15) * 15;
        const hours = range.start + Math.floor(snappedMinutes / 60);
        const minutes = snappedMinutes % 60;

        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    }

    pinTaskToSlot(taskGuid, time) {
        console.log(`[Flow] Pinning task ${taskGuid} to ${time.toLocaleTimeString()}`);
        this.pinnedSlots.set(taskGuid, time);
        this.renderOverlay();
    }

    unpinTask(taskGuid) {
        console.log(`[Flow] Unpinning task ${taskGuid}`);
        this.pinnedSlots.delete(taskGuid);
        this.renderOverlay();
    }

    getTaskEstimate(guid) {
        if (this.taskEstimates.has(guid)) {
            return this.taskEstimates.get(guid);
        }
        return 30; // default
    }

    getTaskEstimateStr(guid) {
        const min = this.getTaskEstimate(guid);
        if (min >= 60) {
            const h = Math.floor(min / 60);
            const m = min % 60;
            return m > 0 ? `${h}h${m}m` : `${h}h`;
        }
        return `${min}m`;
    }

    estimateToMinutes(estimate) {
        if (!estimate) return 30;
        const match = estimate.match(/(\d+)([hm])/);
        if (!match) return 30;
        const num = parseInt(match[1], 10);
        return match[2] === 'h' ? num * 60 : num;
    }

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

        const activeTimer = this.overlay.querySelector('.flow-active-timer');
        if (activeTimer) activeTimer.textContent = timeStr;
    }

    async addAllToCalendar() {
        if (!window.plannerHub) return;
        const unscheduled = await window.plannerHub.getUnscheduledTasks();
        const tasks = unscheduled.filter(t => t.status !== 'done');
        console.log(`[Flow] Add all: ${tasks.length} tasks would be floated into calendar`);
        this.renderOverlay();
    }

    showEstimateDropdown(buttonEl, taskGuid) {
        const existing = document.querySelector('.flow-estimate-dropdown');
        if (existing) existing.remove();

        const rect = buttonEl.getBoundingClientRect();
        const dropdown = document.createElement('div');
        dropdown.className = 'flow-estimate-dropdown';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;

        const options = ['15m', '30m', '1h', '2h', '4h'];
        dropdown.innerHTML = `
            ${options.map(opt => `<div class="flow-estimate-option" data-estimate="${opt}">${opt}</div>`).join('')}
            <div class="flow-estimate-custom"><input type="text" placeholder="e.g. 90" title="Enter minutes"></div>
        `;

        document.body.appendChild(dropdown);

        dropdown.addEventListener('click', async (e) => {
            const optionEl = e.target.closest('.flow-estimate-option');
            if (optionEl) {
                const estimate = optionEl.dataset.estimate;
                this.taskEstimates.set(taskGuid, this.estimateToMinutes(estimate));
                this.renderOverlay();
                dropdown.remove();
            }
        });

        const input = dropdown.querySelector('input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const minutes = parseInt(input.value, 10);
                if (minutes > 0) {
                    this.taskEstimates.set(taskGuid, minutes);
                    this.renderOverlay();
                    dropdown.remove();
                }
            } else if (e.key === 'Escape') {
                dropdown.remove();
            }
        });

        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== buttonEl) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);

        input.focus();
    }

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
