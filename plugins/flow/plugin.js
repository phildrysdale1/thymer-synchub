const VERSION = 'v1.0.0';
/**
 * Flow - Your Focus Companion
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

const FLOW_CSS = `
    /* ========================================
       FLOW STATUS BAR
       ======================================== */
    .flow-status-bar {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
    }

    .flow-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--text-muted);
        transition: all 0.3s ease;
    }

    .flow-status-dot.active {
        background: #3fb950;
        animation: flowPulse 2s ease-in-out infinite;
    }

    .flow-status-dot.paused {
        background: #d29922;
        animation: none;
    }

    @keyframes flowPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.15); }
    }

    .flow-status-task {
        color: var(--text-default);
        font-weight: 500;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    .flow-status-time {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        color: #3fb950;
        font-weight: 600;
        font-size: 11px;
    }

    .flow-status-time.paused {
        color: #d29922;
    }

    /* ========================================
       FLOW COMPACT OVERLAY
       ======================================== */
    .flow-compact {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: var(--bg-default, #1a1a1a);
        border: 1px solid var(--border-default, rgba(255,255,255,0.08));
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        z-index: 9999;
        font-family: var(--font-family);
        animation: flowSlideUp 0.3s ease;
    }

    @keyframes flowSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .flow-compact-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
    }

    .flow-compact-status {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .flow-compact-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #3fb950;
        animation: flowPulse 2s ease-in-out infinite;
    }

    .flow-compact-status-dot.paused {
        background: #d29922;
        animation: none;
    }

    .flow-compact-status-dot.idle {
        background: var(--text-muted);
        animation: none;
    }

    .flow-compact-status-text {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #3fb950;
        font-weight: 600;
    }

    .flow-compact-status-text.paused { color: #d29922; }
    .flow-compact-status-text.idle { color: var(--text-muted); }

    .flow-compact-controls {
        display: flex;
        gap: 4px;
    }

    .flow-compact-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        background: var(--bg-hover, #242424);
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
    }

    .flow-compact-btn:hover {
        background: var(--bg-active, #2a2a2a);
        color: var(--text-default);
    }

    .flow-compact-body {
        padding: 16px;
    }

    .flow-compact-task {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-default);
        margin-bottom: 4px;
    }

    .flow-compact-task-link {
        color: #4f9eed;
        text-decoration: none;
    }

    .flow-compact-task-link:hover {
        text-decoration: underline;
    }

    .flow-compact-source {
        font-size: 12px;
        color: var(--text-muted);
        margin-bottom: 14px;
    }

    .flow-compact-timer {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 14px;
    }

    .flow-compact-timer-ring {
        width: 48px;
        height: 48px;
        position: relative;
        flex-shrink: 0;
    }

    .flow-compact-timer-ring svg {
        transform: rotate(-90deg);
        width: 48px;
        height: 48px;
    }

    .flow-compact-timer-ring circle {
        fill: none;
        stroke-width: 4;
    }

    .flow-compact-timer-ring .ring-bg {
        stroke: var(--border-default, rgba(255,255,255,0.08));
    }

    .flow-compact-timer-ring .ring-progress {
        stroke: #3fb950;
        stroke-linecap: round;
        stroke-dasharray: 126;
        stroke-dashoffset: 126;
        transition: stroke-dashoffset 1s ease;
    }

    .flow-compact-timer-value {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-default);
    }

    .flow-compact-timer-info {
        flex: 1;
        min-width: 0;
    }

    .flow-compact-timer-elapsed {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 28px;
        font-weight: 700;
        color: var(--text-default);
        line-height: 1;
    }

    .flow-compact-timer-label {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 2px;
    }

    .flow-compact-progress {
        height: 4px;
        background: var(--border-default, rgba(255,255,255,0.08));
        border-radius: 2px;
        margin-bottom: 16px;
        overflow: hidden;
    }

    .flow-compact-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #3fb950, #58a6ff);
        border-radius: 2px;
        transition: width 0.3s ease;
    }

    .flow-compact-next {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: var(--bg-hover, #242424);
        border-radius: 8px;
    }

    .flow-compact-next-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .flow-compact-next-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-faint, #555);
    }

    .flow-compact-next-task {
        font-size: 13px;
        color: var(--text-muted);
    }

    .flow-compact-next-time {
        font-size: 11px;
        color: var(--text-faint, #555);
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
    }

    .flow-compact-footer {
        display: flex;
        border-top: 1px solid var(--border-default, rgba(255,255,255,0.08));
    }

    .flow-compact-action {
        flex: 1;
        padding: 12px;
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.15s ease;
    }

    .flow-compact-action:hover {
        background: var(--bg-hover, #242424);
        color: var(--text-default);
    }

    .flow-compact-action:first-child {
        border-right: 1px solid var(--border-default, rgba(255,255,255,0.08));
    }

    .flow-compact-action.primary {
        color: #4f9eed;
    }

    .flow-compact-action.start {
        color: #3fb950;
    }

    /* ========================================
       FLOW FULL OVERLAY
       ======================================== */
    .flow-full {
        position: fixed;
        top: 20px;
        right: 20px;
        bottom: 20px;
        width: 420px;
        background: var(--bg-default, #1a1a1a);
        border: 1px solid var(--border-default, rgba(255,255,255,0.08));
        border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9999;
        font-family: var(--font-family);
        animation: flowSlideUp 0.3s ease;
    }

    .flow-full-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
    }

    .flow-full-title {
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-default);
    }

    .flow-full-title-icon {
        color: #4f9eed;
    }

    .flow-full-body {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    .flow-full-main {
        flex: 1;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow-y: auto;
    }

    /* Big Timer */
    .flow-big-timer {
        width: 160px;
        height: 160px;
        position: relative;
        margin-bottom: 24px;
    }

    .flow-big-timer svg {
        transform: rotate(-90deg);
        filter: drop-shadow(0 0 20px rgba(63, 185, 80, 0.3));
        animation: flowTimerPulse 3s ease-in-out infinite;
    }

    @keyframes flowTimerPulse {
        0%, 100% { filter: drop-shadow(0 0 20px rgba(63, 185, 80, 0.3)); }
        50% { filter: drop-shadow(0 0 30px rgba(63, 185, 80, 0.5)); }
    }

    .flow-big-timer circle {
        fill: none;
    }

    .flow-big-timer .timer-bg {
        stroke: var(--border-default, rgba(255,255,255,0.08));
        stroke-width: 8;
    }

    .flow-big-timer .timer-progress {
        stroke: url(#flowTimerGradient);
        stroke-width: 8;
        stroke-linecap: round;
        stroke-dasharray: 440;
        stroke-dashoffset: 440;
        transition: stroke-dashoffset 1s ease;
    }

    .flow-big-timer .timer-glow {
        stroke: #3fb950;
        stroke-width: 12;
        stroke-linecap: round;
        stroke-dasharray: 440;
        stroke-dashoffset: 440;
        opacity: 0.2;
        filter: blur(8px);
    }

    .flow-big-timer-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
    }

    .flow-big-timer-value {
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        font-size: 32px;
        font-weight: 700;
        color: var(--text-default);
        line-height: 1;
    }

    .flow-big-timer-label {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-top: 4px;
    }

    .flow-current-task {
        text-align: center;
        margin-bottom: 24px;
    }

    .flow-current-task-label {
        font-size: 11px;
        color: var(--text-faint, #555);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 8px;
    }

    .flow-current-task-name {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-default);
        margin-bottom: 4px;
    }

    .flow-current-task-name a {
        color: #4f9eed;
        text-decoration: none;
    }

    .flow-current-task-name a:hover {
        text-decoration: underline;
    }

    .flow-current-task-source {
        font-size: 12px;
        color: var(--text-muted);
    }

    .flow-timer-controls {
        display: flex;
        gap: 12px;
        margin-bottom: 24px;
    }

    .flow-timer-btn {
        padding: 12px 24px;
        border-radius: 10px;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s ease;
    }

    .flow-timer-btn.pause {
        background: #9e6a03;
        color: white;
    }

    .flow-timer-btn.pause:hover {
        background: #b87a03;
        transform: translateY(-1px);
    }

    .flow-timer-btn.resume {
        background: #238636;
        color: white;
    }

    .flow-timer-btn.resume:hover {
        background: #2ea043;
        transform: translateY(-1px);
    }

    .flow-timer-btn.end {
        background: var(--bg-hover, #242424);
        border: 1px solid var(--border-default, rgba(255,255,255,0.08));
        color: var(--text-default);
    }

    .flow-timer-btn.end:hover {
        background: var(--bg-active, #2a2a2a);
        border-color: var(--border-strong, rgba(255,255,255,0.15));
    }

    .flow-timer-btn.start {
        background: #238636;
        color: white;
    }

    .flow-timer-btn.start:hover {
        background: #2ea043;
        transform: translateY(-1px);
    }

    /* Timeline Sidebar */
    .flow-timeline {
        width: 140px;
        border-left: 1px solid var(--border-default, rgba(255,255,255,0.08));
        padding: 16px 12px;
        overflow-y: auto;
    }

    .flow-timeline-header {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-faint, #555);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .flow-timeline-hours {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .flow-timeline-slot {
        display: flex;
        align-items: stretch;
        min-height: 36px;
    }

    .flow-timeline-hour {
        width: 36px;
        font-size: 10px;
        color: var(--text-faint, #555);
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        padding-top: 4px;
    }

    .flow-timeline-block {
        flex: 1;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 10px;
        cursor: pointer;
        transition: all 0.15s ease;
        overflow: hidden;
    }

    .flow-timeline-block:hover {
        transform: translateX(2px);
    }

    .flow-timeline-block.empty {
        background: var(--bg-hover, #242424);
        border: 1px dashed var(--border-default, rgba(255,255,255,0.08));
    }

    .flow-timeline-block.task {
        background: linear-gradient(135deg, rgba(79, 158, 237, 0.2), rgba(79, 158, 237, 0.1));
        border: 1px solid rgba(79, 158, 237, 0.3);
        color: #4f9eed;
    }

    .flow-timeline-block.task.active {
        background: linear-gradient(135deg, rgba(63, 185, 80, 0.25), rgba(63, 185, 80, 0.15));
        border-color: rgba(63, 185, 80, 0.4);
        color: #3fb950;
        box-shadow: 0 0 12px rgba(63, 185, 80, 0.2);
    }

    .flow-timeline-block.calendar {
        background: linear-gradient(135deg, rgba(137, 87, 229, 0.2), rgba(137, 87, 229, 0.1));
        border: 1px solid rgba(137, 87, 229, 0.3);
        color: #a371f7;
    }

    .flow-timeline-block-name {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Unscheduled Footer */
    .flow-full-footer {
        border-top: 1px solid var(--border-default, rgba(255,255,255,0.08));
        padding: 16px 20px;
    }

    .flow-unscheduled-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }

    .flow-unscheduled-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-faint, #555);
    }

    .flow-unscheduled-tasks {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .flow-unscheduled-task {
        padding: 8px 12px;
        background: var(--bg-hover, #242424);
        border: 1px solid var(--border-default, rgba(255,255,255,0.08));
        border-radius: 8px;
        font-size: 12px;
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .flow-unscheduled-task:hover {
        background: var(--bg-active, #2a2a2a);
        border-color: #4f9eed;
        color: var(--text-default);
    }

    .flow-unscheduled-task .ti {
        color: #4f9eed;
    }

    /* Idle state */
    .flow-idle-message {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-muted);
    }

    .flow-idle-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.3;
    }

    .flow-idle-text {
        font-size: 14px;
        margin-bottom: 20px;
    }

    .flow-start-btn {
        padding: 12px 32px;
        background: #238636;
        border: none;
        border-radius: 10px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s ease;
    }

    .flow-start-btn:hover {
        background: #2ea043;
        transform: translateY(-1px);
    }

    /* Task picker */
    .flow-task-picker {
        width: 100%;
        max-height: 300px;
        overflow-y: auto;
    }

    .flow-task-picker-item {
        padding: 12px;
        border: 1px solid var(--border-default, rgba(255,255,255,0.08));
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .flow-task-picker-item:hover {
        background: var(--bg-hover, #242424);
        border-color: #4f9eed;
    }

    .flow-task-picker-item-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-default);
        margin-bottom: 4px;
    }

    .flow-task-picker-item-meta {
        font-size: 11px;
        color: var(--text-muted);
    }
`;

class Plugin extends AppPlugin {
    async onLoad() {
        // Initialize state
        this.mode = 'status'; // 'status' | 'compact' | 'full'
        this.session = null;  // { taskGuid, taskText, startTime, pausedTime, totalPausedMs, isPaused }
        this.timerInterval = null;
        this.overlay = null;
        this.statusBarItem = null;

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

        // Inject CSS
        this.injectCSS();

        // Setup status bar
        this.setupStatusBar();

        // Expose API
        this.exposeAPI();

        // Check for PlannerHub
        this.checkDependencies();

        console.log(`[Flow] Loaded ${VERSION}`);
    }

    injectCSS() {
        const style = document.createElement('style');
        style.id = 'flow-styles';
        style.textContent = FLOW_CSS;
        document.head.appendChild(style);
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
        const taskName = this.truncate(this.session.taskText || 'Working...', 20);

        return `
            <span class="flow-status-bar">
                <span class="flow-status-dot ${dotClass}"></span>
                <span class="flow-status-task">${this.escapeHtml(taskName)}</span>
                <span class="flow-status-time ${timeClass}">${timeStr}</span>
            </span>
        `;
    }

    updateStatusBar() {
        if (this.statusBarItem) {
            this.statusBarItem.setHtmlLabel(this.buildStatusBarLabel());

            const tooltip = this.session
                ? `${this.session.taskText || 'Working'} - ${this.session.isPaused ? 'Paused' : 'In progress'}`
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
        let taskText = 'Focus session';
        let actualGuid = taskGuid;

        // If no task specified, get the next one from PlannerHub
        if (!taskGuid && window.plannerHub) {
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const nextTask = tasks.find(t => t.status !== 'done');
            if (nextTask) {
                actualGuid = nextTask.guid;
                taskText = nextTask.text || nextTask.linkedIssueTitle || 'Task';
            }
        } else if (taskGuid && window.plannerHub) {
            // Get task details
            const tasks = await window.plannerHub.getPlannerHubTasks();
            const task = tasks.find(t => t.guid === taskGuid);
            if (task) {
                taskText = task.text || task.linkedIssueTitle || 'Task';
            }
        }

        // Mark as in progress
        if (actualGuid && window.plannerHub) {
            await window.plannerHub.markInProgress(actualGuid);
        }

        this.session = {
            taskGuid: actualGuid,
            taskText,
            startTime: Date.now(),
            pausedTime: null,
            totalPausedMs: 0,
            isPaused: false
        };

        console.log(`[Flow] Session started: ${taskText}`);
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
                            <span class="ti ti-arrows-maximize"></span>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>
                <div class="flow-compact-body">
                    <div class="flow-compact-task">${this.escapeHtml(this.session.taskText)}</div>
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
                                <div class="flow-compact-next-task">${this.escapeHtml(this.truncate(nextTask.text || nextTask.linkedIssueTitle || 'Task', 25))}</div>
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
                            <span class="ti ti-arrows-maximize"></span>
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
                                    <div class="flow-task-picker-item-title">${this.escapeHtml(t.text || t.linkedIssueTitle || 'Task')}</div>
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
        const elapsed = this.getElapsedTime();
        const timeStr = this.formatTime(elapsed);
        const progress = Math.min((elapsed / (60 * 60 * 1000)) * 100, 100);
        const circumference = 440; // 2 * PI * 70
        const offset = circumference - (progress / 100 * circumference);

        // Get timeline
        let timeline = [];
        let unscheduled = [];
        if (window.plannerHub) {
            timeline = await window.plannerHub.getTimelineView({
                workdayStart: '09:00',
                workdayEnd: '18:00',
                includeCalendar: !!window.calendarHub
            });
            unscheduled = await window.plannerHub.getUnscheduledTasks();
            unscheduled = unscheduled.filter(t => t.status !== 'done').slice(0, 5);
        }

        if (!this.session) {
            await this.renderIdleFull(timeline, unscheduled);
            return;
        }

        this.overlay.innerHTML = `
            <div class="flow-full">
                <div class="flow-full-header">
                    <div class="flow-full-title">
                        <span class="ti ti-flame flow-full-title-icon"></span>
                        Flow
                    </div>
                    <div class="flow-compact-controls">
                        <button class="flow-compact-btn" data-action="compact" title="Compact">
                            <span class="ti ti-layout-bottombar"></span>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>

                <div class="flow-full-body">
                    <div class="flow-full-main">
                        <div class="flow-big-timer">
                            <svg width="160" height="160" viewBox="0 0 160 160">
                                <defs>
                                    <linearGradient id="flowTimerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" style="stop-color:#3fb950"/>
                                        <stop offset="100%" style="stop-color:#58a6ff"/>
                                    </linearGradient>
                                </defs>
                                <circle class="timer-bg" cx="80" cy="80" r="70"/>
                                <circle class="timer-glow" cx="80" cy="80" r="70" style="stroke-dashoffset: ${offset}"/>
                                <circle class="timer-progress" cx="80" cy="80" r="70" style="stroke-dashoffset: ${offset}"/>
                            </svg>
                            <div class="flow-big-timer-inner">
                                <div class="flow-big-timer-value">${timeStr}</div>
                                <div class="flow-big-timer-label">${this.session.isPaused ? 'paused' : 'elapsed'}</div>
                            </div>
                        </div>

                        <div class="flow-current-task">
                            <div class="flow-current-task-label">Currently working on</div>
                            <div class="flow-current-task-name">${this.escapeHtml(this.session.taskText)}</div>
                            <div class="flow-current-task-source">Focus session</div>
                        </div>

                        <div class="flow-timer-controls">
                            ${this.session.isPaused ? `
                                <button class="flow-timer-btn resume" data-action="resume">
                                    <span class="ti ti-player-play"></span>
                                    Resume
                                </button>
                            ` : `
                                <button class="flow-timer-btn pause" data-action="pause">
                                    <span class="ti ti-player-pause"></span>
                                    Pause
                                </button>
                            `}
                            <button class="flow-timer-btn end" data-action="complete">
                                <span class="ti ti-player-stop"></span>
                                End Session
                            </button>
                        </div>
                    </div>

                    <div class="flow-timeline">
                        <div class="flow-timeline-header">
                            <span class="ti ti-calendar"></span>
                            Today
                        </div>
                        <div class="flow-timeline-hours">
                            ${this.renderTimelineSlots(timeline)}
                        </div>
                    </div>
                </div>

                ${unscheduled.length > 0 ? `
                    <div class="flow-full-footer">
                        <div class="flow-unscheduled-header">
                            <span class="flow-unscheduled-title">Unscheduled</span>
                        </div>
                        <div class="flow-unscheduled-tasks">
                            ${unscheduled.map(t => `
                                <div class="flow-unscheduled-task" data-action="start-task" data-guid="${t.guid}">
                                    <span class="ti ti-checkbox"></span>
                                    ${this.escapeHtml(this.truncate(t.text || t.linkedIssueTitle || 'Task', 20))}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async renderIdleFull(timeline, unscheduled) {
        let tasks = [];
        if (window.plannerHub) {
            tasks = await window.plannerHub.getPlannerHubTasks();
            tasks = tasks.filter(t => t.status !== 'done').slice(0, 5);
        }

        this.overlay.innerHTML = `
            <div class="flow-full">
                <div class="flow-full-header">
                    <div class="flow-full-title">
                        <span class="ti ti-flame flow-full-title-icon"></span>
                        Flow
                    </div>
                    <div class="flow-compact-controls">
                        <button class="flow-compact-btn" data-action="compact" title="Compact">
                            <span class="ti ti-layout-bottombar"></span>
                        </button>
                        <button class="flow-compact-btn" data-action="close" title="Close">
                            <span class="ti ti-x"></span>
                        </button>
                    </div>
                </div>

                <div class="flow-full-body">
                    <div class="flow-full-main">
                        <div class="flow-idle-message">
                            <div class="flow-idle-icon"><span class="ti ti-flame"></span></div>
                            <div class="flow-idle-text">Ready to focus?</div>
                            ${tasks.length > 0 ? `
                                <button class="flow-start-btn" data-action="start-next">
                                    <span class="ti ti-player-play"></span>
                                    Start Next Task
                                </button>
                            ` : `
                                <div style="font-size: 12px; color: var(--text-muted);">
                                    Add tasks in PlannerHub to get started
                                </div>
                            `}
                        </div>

                        ${tasks.length > 0 ? `
                            <div class="flow-task-picker" style="margin-top: 24px;">
                                ${tasks.map(t => `
                                    <div class="flow-task-picker-item" data-action="start-task" data-guid="${t.guid}">
                                        <div class="flow-task-picker-item-title">${this.escapeHtml(t.text || t.linkedIssueTitle || 'Task')}</div>
                                        <div class="flow-task-picker-item-meta">${t.status}</div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>

                    <div class="flow-timeline">
                        <div class="flow-timeline-header">
                            <span class="ti ti-calendar"></span>
                            Today
                        </div>
                        <div class="flow-timeline-hours">
                            ${this.renderTimelineSlots(timeline)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTimelineSlots(timeline) {
        const hours = [];
        for (let h = 9; h <= 17; h++) {
            const hourStr = h.toString().padStart(2, '0') + ':00';

            // Find items at this hour
            const items = timeline.filter(item => {
                const startHour = item.start.getHours();
                return startHour === h;
            });

            let blockHtml = '<div class="flow-timeline-block empty"></div>';

            if (items.length > 0) {
                const item = items[0];
                const isActive = this.session?.taskGuid === item.guid;
                const typeClass = item.type === 'calendar' ? 'calendar' : 'task';
                const activeClass = isActive ? 'active' : '';
                const name = item.text || item.linkedIssueTitle || item.title || '';

                blockHtml = `
                    <div class="flow-timeline-block ${typeClass} ${activeClass}" data-guid="${item.guid}">
                        <div class="flow-timeline-block-name">${this.escapeHtml(this.truncate(name, 12))}</div>
                    </div>
                `;
            }

            hours.push(`
                <div class="flow-timeline-slot">
                    <div class="flow-timeline-hour">${hourStr}</div>
                    ${blockHtml}
                </div>
            `);
        }

        return hours.join('');
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

        // Update full timer
        const bigTimerValue = this.overlay.querySelector('.flow-big-timer-value');
        if (bigTimerValue) bigTimerValue.textContent = timeStr;

        const bigProgress = this.overlay.querySelectorAll('.timer-progress, .timer-glow');
        bigProgress.forEach(el => {
            const circumference = 440;
            const offset = circumference - (progress / 100 * circumference);
            el.style.strokeDashoffset = offset;
        });
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
            }
        });
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
}
