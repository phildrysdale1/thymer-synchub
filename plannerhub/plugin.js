const VERSION = 'v1.1.2';
/**
 * PlannerHub - Your companion for daily planning
 *
 * Phase 1+: Planning MVP
 * - Kanban view: Today's Plan | Doing | Next | Daily Note
 * - Today's Plan: tasks for today (from PlannerHub section)
 * - Doing/Next: issues by status (click to add "work on [[issue]]")
 * - Daily Note: browse any day's tasks, transclude to today's plan
 * - MCP tools for AI assistants
 *
 * Phase 2: Time Scheduling
 * - Schedule tasks with time slots (stored as child items)
 * - Auto-fill unscheduled tasks into timeline gaps (1hr default)
 * - Unified timeline view for Session plugin integration
 * - Status manipulation APIs (markDone, markInProgress)
 */

const PLANNERHUB_HEADING = 'PlannerHub';

// Status mapping: raw done value → semantic status
// Raw values: undefined/0=unchecked, 1=in-progress, 2=blocked, 3-7=other, 8=done
const STATUS_TODO = 'todo';
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_DONE = 'done';

function getTaskStatus(rawDone) {
    if (rawDone === 8) return STATUS_DONE;
    if (rawDone === 1) return STATUS_IN_PROGRESS;
    return STATUS_TODO;  // undefined, 0, 2-7 all map to todo
}

// Cache heading GUID per journal to avoid timing issues
const headingCache = new Map(); // journalGuid -> headingGuid

// Lock to prevent concurrent operations
let operationLock = false;

const PLANNER_CSS = `
    .planner-view {
        padding: 24px;
        font-family: var(--font-family);
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .planner-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        flex-shrink: 0;
    }

    .planner-title {
        font-size: 20px;
        font-weight: 600;
        color: var(--text-default);
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .planner-title-icon {
        color: var(--accent-color);
    }

    .planner-date {
        font-size: 14px;
        color: var(--text-muted);
        font-weight: 400;
    }

    .planner-actions {
        display: flex;
        gap: 8px;
    }

    .planner-btn {
        padding: 8px 14px;
        background: var(--bg-hover);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        color: var(--text-default);
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
    }

    .planner-btn:hover {
        background: var(--bg-active);
        border-color: var(--border-strong);
    }

    .planner-btn.primary {
        background: var(--accent-color);
        border-color: var(--accent-color);
        color: white;
    }

    .planner-btn.primary:hover {
        background: var(--accent-hover, #6bb3ff);
    }

    /* Kanban Layout */
    .planner-kanban {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .planner-column {
        background: var(--bg-hover);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
    }

    .planner-column-header {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border-default);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }

    .planner-column-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .planner-column-title.plan { color: var(--enum-green-fg); }
    .planner-column-title.doing { color: var(--enum-blue-fg); }
    .planner-column-title.next { color: var(--enum-purple-fg); }
    .planner-column-title.daily-note { color: var(--enum-yellow-fg); }

    .planner-column-count {
        font-size: 11px;
        padding: 2px 8px;
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        color: var(--text-muted);
    }

    .planner-column-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    /* Task/Issue Cards */
    .planner-card {
        padding: 12px 14px;
        background: var(--bg-default);
        border: 1px solid var(--border-default);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .planner-card:hover {
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .planner-card.task {
        border-left: 3px solid var(--enum-green-fg);
    }

    .planner-card.issue {
        border-left: 3px solid var(--enum-blue-fg);
    }

    .planner-card.done {
        opacity: 0.6;
    }

    .planner-card.done .planner-card-title {
        text-decoration: line-through;
        color: var(--text-muted);
    }

    .planner-card.planned {
        opacity: 0.5;
    }

    .planner-card.planned .planner-card-title {
        color: var(--text-muted);
    }

    .planner-card.daily-note-task {
        border-left: 3px solid var(--enum-yellow-fg);
    }

    .planner-card.in-plan {
        opacity: 0.5;
    }

    .planner-card.in-plan .planner-card-title {
        color: var(--text-muted);
    }

    /* Add All Button */
    .planner-add-all-btn {
        width: 100%;
        padding: 8px;
        margin-bottom: 8px;
        background: var(--bg-default);
        border: 1px dashed var(--border-strong);
        border-radius: 6px;
        color: var(--text-muted);
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.15s ease;
    }

    .planner-add-all-btn:hover {
        background: var(--bg-hover);
        border-color: var(--accent-color);
        color: var(--text-default);
    }

    /* Day Navigation */
    .planner-day-nav {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
    }

    .planner-day-nav-btn {
        width: 24px;
        height: 24px;
        border: none;
        background: var(--bg-default);
        border-radius: 4px;
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
    }

    .planner-day-nav-btn:hover {
        background: var(--bg-active);
        color: var(--text-default);
    }

    .planner-day-nav-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .planner-day-label {
        font-size: 11px;
        color: var(--text-muted);
        min-width: 50px;
        text-align: center;
    }

    .planner-card-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 6px;
    }

    .planner-card-checkbox {
        width: 18px;
        height: 18px;
        border: 2px solid var(--border-strong);
        border-radius: 4px;
        flex-shrink: 0;
        margin-top: 1px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .planner-card-checkbox:hover {
        border-color: var(--accent-color);
    }

    .planner-card.done .planner-card-checkbox {
        background: var(--enum-green-bg);
        border-color: var(--enum-green-bg);
    }

    .planner-card.done .planner-card-checkbox::after {
        content: '\\e92c';
        font-family: 'tabler-icons';
        font-size: 12px;
        color: white;
    }

    .planner-card-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-default);
        flex: 1;
        line-height: 1.4;
    }

    .planner-card-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 11px;
        color: var(--text-muted);
    }

    .planner-card-repo {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .planner-card-number {
        color: var(--text-faint);
    }

    .planner-card-actions {
        display: none;
        gap: 4px;
        margin-left: auto;
    }

    .planner-card:hover .planner-card-actions {
        display: flex;
    }

    .planner-card-action {
        width: 24px;
        height: 24px;
        border: none;
        background: var(--bg-hover);
        border-radius: 4px;
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    }

    .planner-card-action:hover {
        background: var(--accent-color);
        color: white;
    }

    /* Reorder buttons */
    .planner-card-reorder {
        display: none;
        flex-direction: column;
        gap: 2px;
        margin-left: auto;
    }

    .planner-card:hover .planner-card-reorder {
        display: flex;
    }

    .planner-reorder-btn {
        width: 20px;
        height: 16px;
        border: none;
        background: transparent;
        color: var(--text-faint);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        border-radius: 3px;
        padding: 0;
    }

    .planner-reorder-btn:hover {
        background: var(--bg-active);
        color: var(--text-default);
    }

    .planner-reorder-btn:disabled {
        opacity: 0;
        cursor: default;
    }

    /* Linked Issue Style */
    .planner-link {
        color: color(display-p3 0.396 0.784 0.733);
    }

    .planner-empty-task {
        color: var(--text-muted);
        font-style: italic;
    }

    /* Empty State */
    .planner-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-muted);
    }

    .planner-empty-icon {
        font-size: 32px;
        margin-bottom: 8px;
        opacity: 0.5;
    }

    /* Footer Stats */
    .planner-footer {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--border-default);
        display: flex;
        justify-content: center;
        gap: 24px;
        font-size: 13px;
        color: var(--text-muted);
        flex-shrink: 0;
    }

    .planner-stat {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .planner-stat-value {
        font-weight: 600;
        color: var(--text-default);
    }
`;

class Plugin extends CollectionPlugin {

    async onLoad() {
        // Find our collection
        const collections = await this.data.getAllCollections();
        this.myCollection = collections.find(c => c.getName() === this.getName());

        if (!this.myCollection) {
            console.error('[PlannerHub] Could not find own collection');
            return;
        }

        // Inject CSS
        this.ui.injectCSS(PLANNER_CSS);

        // Expose global API
        this.exposeAPI();

        // Register views
        this.registerPlannerView();

        // Register with SyncHub for MCP tools
        this.registerWithSyncHub();

        console.log('[PlannerHub] Loaded');
    }

    // =========================================================================
    // Global API (window.plannerHub)
    // =========================================================================

    exposeAPI() {
        window.plannerHub = {
            version: VERSION,

            // ─────────────────────────────────────────────────────
            // Read - Tasks
            // ─────────────────────────────────────────────────────
            getTodayTasks: () => this.getTodayTasks(),
            getPlannerHubTasks: () => this.getPlannerHubTasks(),
            getIssues: (status) => this.getIssuesByStatus(status),
            getWhatsNext: () => this.getWhatsNext(),
            getCurrentMonth: () => this.getOrCreateCurrentMonth(),
            getIncompleteTasks: (daysBack) => this.getIncompleteTasks(daysBack),

            // ─────────────────────────────────────────────────────
            // Read - Timeline (Phase 2)
            // ─────────────────────────────────────────────────────
            getTimelineView: (opts) => this.getTimelineView(opts),
            getScheduledTasks: () => this.getScheduledTasks(),
            getUnscheduledTasks: () => this.getUnscheduledTasks(),
            getTaskSchedule: (taskGuid) => this.getTaskSchedule(taskGuid),

            // ─────────────────────────────────────────────────────
            // Write - Tasks
            // ─────────────────────────────────────────────────────
            addToToday: (text, issueGuid) => this.addToToday(text, issueGuid),
            migrateTask: (taskGuid, sourceJournal) => this.migrateTask(taskGuid, sourceJournal),
            unplanTask: (issueGuid) => this.unplanTask(issueGuid),

            // ─────────────────────────────────────────────────────
            // Write - Status (Phase 2)
            // ─────────────────────────────────────────────────────
            setTaskStatus: (taskGuid, status) => this.setTaskStatus(taskGuid, status),
            markDone: (taskGuid) => this.markDone(taskGuid),
            markInProgress: (taskGuid) => this.markInProgress(taskGuid),

            // ─────────────────────────────────────────────────────
            // Write - Scheduling (Phase 2)
            // ─────────────────────────────────────────────────────
            scheduleTask: (taskGuid, start, end) => this.scheduleTask(taskGuid, start, end),
            unscheduleTask: (taskGuid) => this.unscheduleTask(taskGuid),

            // ─────────────────────────────────────────────────────
            // Write - Reorder (Phase 2)
            // ─────────────────────────────────────────────────────
            moveTaskAfter: (taskGuid, afterGuid) => this.moveTaskAfter(taskGuid, afterGuid),
        };

        // Expose test suite
        this.exposeTestSuite();

        console.log('[PlannerHub] API exposed at window.plannerHub');
    }

    exposeTestSuite() {
        window.plannerHubTests = {
            // ─────────────────────────────────────────────────────
            // Test Runner
            // ─────────────────────────────────────────────────────
            async runAll() {
                console.log('🧪 PlannerHub Test Suite');
                console.log('========================\n');

                const tests = [
                    this.testGetTasks,
                    this.testStatusManipulation,
                    this.testScheduling,
                    this.testTimelineView,
                ];

                let passed = 0;
                let failed = 0;

                for (const test of tests) {
                    try {
                        await test.call(this);
                        passed++;
                    } catch (e) {
                        console.error(`❌ ${test.name} failed:`, e);
                        failed++;
                    }
                }

                console.log('\n========================');
                console.log(`✅ Passed: ${passed}`);
                console.log(`❌ Failed: ${failed}`);
                return { passed, failed };
            },

            // ─────────────────────────────────────────────────────
            // Test: Get Tasks
            // ─────────────────────────────────────────────────────
            async testGetTasks() {
                console.log('📋 Test: Get Tasks');

                const tasks = await window.plannerHub.getPlannerHubTasks();
                console.log(`  Found ${tasks.length} tasks in PlannerHub section`);

                if (tasks.length > 0) {
                    const task = tasks[0];
                    console.log(`  First task: "${task.text || task.linkedIssueTitle || '(no text)'}" [${task.guid}]`);
                }

                const scheduled = await window.plannerHub.getScheduledTasks();
                console.log(`  Scheduled: ${scheduled.length}`);

                const unscheduled = await window.plannerHub.getUnscheduledTasks();
                console.log(`  Unscheduled: ${unscheduled.length}`);

                console.log('  ✅ testGetTasks passed\n');
            },

            // ─────────────────────────────────────────────────────
            // Test: Status Manipulation
            // ─────────────────────────────────────────────────────
            async testStatusManipulation() {
                console.log('🔄 Test: Status Manipulation');

                const tasks = await window.plannerHub.getPlannerHubTasks();
                if (tasks.length === 0) {
                    console.log('  ⚠️ No tasks to test - add a task first');
                    console.log('  ✅ testStatusManipulation skipped\n');
                    return;
                }

                const task = tasks[0];
                const originalStatus = task.status;
                const originalRaw = task.rawStatus;
                console.log(`  Testing on: "${task.text || task.linkedIssueTitle}" (status: ${originalStatus})`);

                // Test markInProgress
                const inProgressResult = await window.plannerHub.markInProgress(task.guid);
                console.log(`  markInProgress: ${inProgressResult ? '✓' : '✗'}`);

                // Read back
                const afterInProgress = await window.plannerHub.getPlannerHubTasks();
                const taskAfter = afterInProgress.find(t => t.guid === task.guid);
                console.log(`  Status after markInProgress: ${taskAfter?.status}`);

                // Restore original
                await window.plannerHub.setTaskStatus(task.guid, originalRaw || 0);
                console.log(`  Restored original status: ${originalStatus}`);

                console.log('  ✅ testStatusManipulation passed\n');
            },

            // ─────────────────────────────────────────────────────
            // Test: Scheduling
            // ─────────────────────────────────────────────────────
            async testScheduling() {
                console.log('⏰ Test: Scheduling');

                const tasks = await window.plannerHub.getPlannerHubTasks();
                if (tasks.length === 0) {
                    console.log('  ⚠️ No tasks to test - add a task first');
                    console.log('  ✅ testScheduling skipped\n');
                    return;
                }

                const task = tasks[0];
                console.log(`  Testing on: "${task.text || task.linkedIssueTitle}"`);

                // Check current schedule
                const originalSchedule = await window.plannerHub.getTaskSchedule(task.guid);
                console.log(`  Original schedule: ${originalSchedule ? `${originalSchedule.start.toLocaleTimeString()} - ${originalSchedule.end.toLocaleTimeString()}` : 'none'}`);

                // Schedule for 14:00
                const scheduleResult = await window.plannerHub.scheduleTask(task.guid, '14:00', '15:30');
                console.log(`  scheduleTask('14:00', '15:30'): ${scheduleResult ? '✓' : '✗'}`);

                // Read back
                const newSchedule = await window.plannerHub.getTaskSchedule(task.guid);
                if (newSchedule) {
                    console.log(`  New schedule: ${newSchedule.start.toLocaleTimeString()} - ${newSchedule.end.toLocaleTimeString()}`);
                }

                // Unschedule if it wasn't scheduled before
                if (!originalSchedule) {
                    const unscheduleResult = await window.plannerHub.unscheduleTask(task.guid);
                    console.log(`  unscheduleTask: ${unscheduleResult ? '✓' : '✗'}`);
                }

                console.log('  ✅ testScheduling passed\n');
            },

            // ─────────────────────────────────────────────────────
            // Test: Timeline View
            // ─────────────────────────────────────────────────────
            async testTimelineView() {
                console.log('📅 Test: Timeline View');

                const timeline = await window.plannerHub.getTimelineView({
                    workdayStart: '09:00',
                    workdayEnd: '18:00',
                    defaultDuration: 60,
                    includeCalendar: true
                });

                console.log(`  Timeline has ${timeline.length} items:`);

                for (const item of timeline) {
                    const startTime = item.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const endTime = item.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const label = item.text || item.linkedIssueTitle || '(no text)';
                    const typeIcon = {
                        scheduled: '📌',
                        auto: '🔄',
                        calendar: '📆',
                        overflow: '⚠️'
                    }[item.type] || '❓';

                    console.log(`    ${startTime}-${endTime} ${typeIcon} ${label} [${item.type}]`);
                }

                console.log('  ✅ testTimelineView passed\n');
            },

            // ─────────────────────────────────────────────────────
            // Interactive Tests
            // ─────────────────────────────────────────────────────
            async addTestTask(text = 'Test task from console') {
                console.log(`Adding task: "${text}"`);
                const result = await window.plannerHub.addToToday(text);
                console.log(`Result: ${result ? '✓ Added' : '✗ Failed'}`);
                return result;
            },

            async scheduleFirstTask(time = '10:00') {
                const tasks = await window.plannerHub.getPlannerHubTasks();
                if (tasks.length === 0) {
                    console.log('No tasks to schedule');
                    return false;
                }
                const task = tasks[0];
                console.log(`Scheduling "${task.text || task.linkedIssueTitle}" at ${time}`);
                return await window.plannerHub.scheduleTask(task.guid, time);
            },

            async showTimeline() {
                return await this.testTimelineView();
            },

            async listTasks() {
                const tasks = await window.plannerHub.getPlannerHubTasks();
                console.log(`\n📋 PlannerHub Tasks (${tasks.length}):`);
                for (let i = 0; i < tasks.length; i++) {
                    const t = tasks[i];
                    const schedule = await window.plannerHub.getTaskSchedule(t.guid);
                    const timeStr = schedule
                        ? ` @ ${schedule.start.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`
                        : '';
                    const statusIcon = {
                        'done': '✓',
                        'in_progress': '▶',
                        'todo': '○'
                    }[t.status] || '?';
                    console.log(`  ${i + 1}. ${statusIcon} ${t.text || t.linkedIssueTitle || '(no text)'}${timeStr} [${t.status}]`);
                    console.log(`     GUID: ${t.guid}`);
                }
                return tasks;
            }
        };
    }

    // =========================================================================
    // Journal Tasks
    // =========================================================================

    async getJournalCollection() {
        const collections = await this.data.getAllCollections();
        return collections.find(c => c.getName() === 'Journal');
    }

    async getTodayJournal() {
        try {
            const journalCollection = await this.getJournalCollection();
            if (!journalCollection) return null;

            const records = await journalCollection.getAllRecords();
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            let journal = records.find(r => r.guid.endsWith(today));

            // Fallback: Thymer uses prev day until ~3am
            if (!journal) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
                journal = records.find(r => r.guid.endsWith(yesterdayStr));
            }

            return journal;
        } catch (e) {
            console.error('[PlannerHub] Error getting journal:', e);
            return null;
        }
    }

    /**
     * Get journal for a specific date offset from today.
     * @param {number} daysBack - Number of days back (1 = yesterday, 2 = day before, etc.)
     * @returns {Object|null} Journal record or null
     */
    async getJournalByOffset(daysBack) {
        try {
            const journalCollection = await this.getJournalCollection();
            if (!journalCollection) return null;

            const records = await journalCollection.getAllRecords();
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - daysBack);
            const dateStr = targetDate.toISOString().slice(0, 10).replace(/-/g, '');

            return records.find(r => r.guid.endsWith(dateStr)) || null;
        } catch (e) {
            console.error('[PlannerHub] Error getting journal by offset:', e);
            return null;
        }
    }

    /**
     * Get all tasks from a specific day's journal.
     * @param {number} daysBack - Number of days back (0 = today)
     * @returns {Array} Array of task objects
     */
    async getJournalTasks(daysBack) {
        const journal = daysBack === 0
            ? await this.getTodayJournal()
            : await this.getJournalByOffset(daysBack);
        if (!journal) return [];

        const tasks = [];
        const seenGuids = new Set();
        try {
            const items = await journal.getLineItems();

            for (const item of items) {
                if (item.type !== 'task') continue;

                // Dedupe
                if (seenGuids.has(item.guid)) continue;
                seenGuids.add(item.guid);

                const segments = item.segments || [];
                let text = '';
                let linkedIssueGuid = null;

                for (const seg of segments) {
                    if (seg.type === 'text' && typeof seg.text === 'string') {
                        text += seg.text;
                    } else if (seg.type === 'ref' && seg.text?.guid) {
                        linkedIssueGuid = seg.text.guid;
                    }
                }

                // Resolve linked issue title
                let linkedIssueTitle = null;
                if (linkedIssueGuid) {
                    const linkedRecord = this.data.getRecord(linkedIssueGuid);
                    if (linkedRecord) {
                        linkedIssueTitle = linkedRecord.getName();
                    }
                }

                const trimmedText = text.trim();
                if (!trimmedText && !linkedIssueGuid) continue;

                // Check status
                const rawStatus = item.props?.done;
                const status = getTaskStatus(rawStatus);

                tasks.push({
                    guid: item.guid,
                    text: trimmedText,
                    status,
                    rawStatus,
                    linkedIssueGuid,
                    linkedIssueTitle,
                    lineItem: item,
                    sourceJournal: journal,
                    daysBack,
                });
            }
        } catch (e) {
            console.error('[PlannerHub] Error reading journal tasks:', e);
        }

        return tasks;
    }

    /**
     * Get tasks from the PlannerHub section ONLY (not all journal tasks).
     * This is what shows in "Today's Plan" column.
     */
    async getPlannerHubTasks() {
        const journal = await this.getTodayJournal();
        if (!journal) return [];

        const tasks = [];
        const seenGuids = new Set();

        try {
            const { sectionItems } = await this.findOrCreatePlannerSection(journal);

            // Get all items for lookup
            const allItems = await journal.getLineItems();

            for (const item of sectionItems) {
                // Handle both tasks and refs (transclusions)
                let actualItem = item;
                let isRef = false;

                if (item.type === 'ref') {
                    // This is a transclusion - get the source item
                    isRef = true;

                    // Try item.itemref first (full object), then look up via props.itemref (GUID)
                    if (item.itemref) {
                        actualItem = item.itemref;
                    } else if (item.props?.itemref) {
                        // Look up the source item by GUID in current journal
                        const sourceGuid = item.props.itemref;
                        actualItem = allItems.find(i => i.guid === sourceGuid);
                        if (!actualItem) {
                            // Source might be in a different journal - skip for now
                            continue;
                        }
                    } else {
                        continue;
                    }
                } else if (item.type !== 'task') {
                    continue;
                }

                // Dedupe by the actual task GUID
                const taskGuid = actualItem.guid || item.guid;
                if (seenGuids.has(taskGuid)) continue;
                seenGuids.add(taskGuid);

                const segments = actualItem.segments || [];
                let text = '';
                let linkedIssueGuid = null;

                for (const seg of segments) {
                    if (seg.type === 'text' && typeof seg.text === 'string') {
                        text += seg.text;
                    } else if (seg.type === 'ref' && seg.text?.guid) {
                        linkedIssueGuid = seg.text.guid;
                    }
                }

                // Resolve linked issue title
                let linkedIssueTitle = null;
                if (linkedIssueGuid) {
                    const linkedRecord = this.data.getRecord(linkedIssueGuid);
                    if (linkedRecord) {
                        linkedIssueTitle = linkedRecord.getName();
                    }
                }

                const trimmedText = text.trim();
                if (!trimmedText && !linkedIssueGuid) continue;

                // Check status from the actual item
                const rawStatus = actualItem.props?.done;
                const status = getTaskStatus(rawStatus);

                tasks.push({
                    guid: item.guid,  // Use the ref's guid for UI operations
                    actualGuid: taskGuid,  // The real task guid
                    text: trimmedText,
                    status,
                    rawStatus,
                    linkedIssueGuid,
                    linkedIssueTitle,
                    lineItem: item,
                    isRef,
                });
            }
        } catch (e) {
            console.error('[PlannerHub] Error reading PlannerHub tasks:', e);
        }

        return tasks;
    }

    /**
     * Get ALL tasks from today's journal (used for API/MCP).
     */
    async getTodayTasks() {
        const journal = await this.getTodayJournal();
        if (!journal) return [];

        const tasks = [];
        const seenGuids = new Set(); // Dedupe by GUID
        try {
            const items = await journal.getLineItems();

            for (const item of items) {
                if (item.type !== 'task') continue;

                // Dedupe: skip if we've already seen this GUID (transclusion)
                if (seenGuids.has(item.guid)) continue;
                seenGuids.add(item.guid);

                const segments = item.segments || [];
                let text = '';
                let linkedIssueGuid = null;

                for (const seg of segments) {
                    if (seg.type === 'text' && typeof seg.text === 'string') {
                        text += seg.text;
                    } else if (seg.type === 'ref' && seg.text?.guid) {
                        linkedIssueGuid = seg.text.guid;
                    }
                }

                // Resolve linked issue title via direct lookup
                let linkedIssueTitle = null;
                if (linkedIssueGuid) {
                    const linkedRecord = this.data.getRecord(linkedIssueGuid);
                    if (linkedRecord) {
                        linkedIssueTitle = linkedRecord.getName();
                    }
                }

                const trimmedText = text.trim();
                if (!trimmedText && !linkedIssueGuid) continue;

                const rawStatus = item.props?.done;
                const status = getTaskStatus(rawStatus);

                tasks.push({
                    guid: item.guid,
                    text: trimmedText,
                    status,
                    rawStatus,
                    linkedIssueGuid,
                    linkedIssueTitle,
                    lineItem: item,
                });
            }
        } catch (e) {
            console.error('[PlannerHub] Error reading tasks:', e);
        }

        return tasks;
    }

    // =========================================================================
    // Issues
    // =========================================================================

    async getIssuesCollection() {
        const collections = await this.data.getAllCollections();
        return collections.find(c => c.getName() === 'Issues');
    }

    async getIssuesByStatus(status) {
        const issuesCollection = await this.getIssuesCollection();
        if (!issuesCollection) return [];

        const records = await issuesCollection.getAllRecords();
        const issues = [];

        for (const record of records) {
            const recordStatus = record.prop('status')?.choice();
            if (status && recordStatus?.toLowerCase() !== status.toLowerCase()) continue;

            issues.push({
                guid: record.guid,
                title: record.getName(),
                status: recordStatus,
                repo: record.text('repo'),
                number: record.prop('number')?.number(),
                type: record.prop('type')?.choice(),
                url: record.text('url'),
            });
        }

        return issues;
    }

    async getAllPlanningIssues() {
        const issuesCollection = await this.getIssuesCollection();
        if (!issuesCollection) return { doing: [], next: [] };

        const records = await issuesCollection.getAllRecords();
        const doing = [];
        const next = [];

        for (const record of records) {
            const status = record.prop('status')?.choice()?.toLowerCase();
            if (!status) continue;

            const issue = {
                guid: record.guid,
                title: record.getName(),
                status: record.prop('status')?.choice(),
                repo: record.text('repo'),
                number: record.prop('number')?.number(),
                type: record.prop('type')?.choice(),
            };

            if (status === 'in progress' || status === 'doing') {
                doing.push(issue);
            } else if (status === 'next') {
                next.push(issue);
            }
        }

        return { doing, next };
    }

    // =========================================================================
    // PlannerHub Section Management
    // =========================================================================

    /**
     * Find or create the ## PlannerHub heading in a journal.
     * Returns the heading item and the last item in the section.
     * Uses a cache to avoid timing issues with rapid calls.
     */
    async findOrCreatePlannerSection(journal) {
        const items = await journal.getLineItems();
        const topLevelItems = items.filter(item => item.parent_guid === journal.guid);

        // Check cache first - if we recently created/found a heading, use that GUID
        const cachedGuid = headingCache.get(journal.guid);

        // Find existing PlannerHub heading (case-insensitive)
        let headingItem = null;
        let headingIndex = -1;
        const searchTerm = PLANNERHUB_HEADING.toLowerCase();

        for (let i = 0; i < topLevelItems.length; i++) {
            const item = topLevelItems[i];

            // If we have a cached GUID, prioritize finding that exact item
            if (cachedGuid && item.guid === cachedGuid) {
                headingItem = item;
                headingIndex = i;
                break;
            }

            // Otherwise search by type and text
            const isHeading = item.type === 'heading' || item.type?.startsWith('h') || item.heading_size;
            if (isHeading) {
                const segments = item.segments || [];
                const text = segments.map(s => s.type === 'text' ? (s.text || '') : '').join('');
                if (text.toLowerCase().includes(searchTerm)) {
                    headingItem = item;
                    headingIndex = i;
                    // Cache this heading GUID for future calls
                    headingCache.set(journal.guid, item.guid);
                    break;
                }
            }
        }

        // Create heading if not found
        if (!headingItem) {
            const lastItem = topLevelItems[topLevelItems.length - 1] || null;
            headingItem = await journal.createLineItem(null, lastItem, 'heading');
            if (headingItem) {
                headingItem.setSegments([{ type: 'text', text: PLANNERHUB_HEADING }]);
                headingItem.setHeadingSize?.(2);
                // Cache the new heading GUID immediately
                headingCache.set(journal.guid, headingItem.guid);
            }
            return { headingItem, lastSectionItem: headingItem, sectionItems: [] };
        }

        // Get CHILDREN of the heading (not siblings after it)
        // Items under a heading have parent_guid === heading.guid
        const sectionItems = items.filter(item => item.parent_guid === headingItem.guid);

        const lastSectionItem = sectionItems.length > 0
            ? sectionItems[sectionItems.length - 1]
            : headingItem;

        return { headingItem, lastSectionItem, sectionItems };
    }

    // =========================================================================
    // Reorder Tasks
    // =========================================================================

    /**
     * Swap two tasks by GUID by swapping their segments and props.
     * SDK can't move items, so we swap content instead.
     */
    async swapPlanTasksByGuid(guidA, guidB) {
        const journal = await this.getTodayJournal();
        if (!journal) return false;

        try {
            const items = await journal.getLineItems();
            const itemA = items.find(i => i.guid === guidA);
            const itemB = items.find(i => i.guid === guidB);

            if (!itemA || !itemB) {
                return false;
            }

            // Swap segments
            const segmentsA = itemA.segments || [];
            const segmentsB = itemB.segments || [];

            itemA.setSegments(segmentsB);
            itemB.setSegments(segmentsA);

            // Also swap props (like done status)
            const propsA = { ...itemA.props };
            const propsB = { ...itemB.props };

            if (itemA.setMetaProperties && itemB.setMetaProperties) {
                itemA.setMetaProperties(propsB);
                itemB.setMetaProperties(propsA);
            }

            return true;
        } catch (e) {
            console.error('[PlannerHub] Error swapping tasks:', e);
            return false;
        }
    }

    // =========================================================================
    // Task Status Manipulation (Phase 2)
    // =========================================================================

    /**
     * Set task status by GUID.
     * @param {string} taskGuid - The task GUID
     * @param {number} status - Status value (0=unchecked, 1=in-progress, 2=blocked, 8=done)
     */
    async setTaskStatus(taskGuid, status) {
        const journal = await this.getTodayJournal();
        if (!journal) return false;

        try {
            const items = await journal.getLineItems();
            const item = items.find(i => i.guid === taskGuid);
            if (!item) return false;

            if (item.setMetaProperties) {
                item.setMetaProperties({ done: status });
                return true;
            }
            return false;
        } catch (e) {
            console.error('[PlannerHub] Error setting task status:', e);
            return false;
        }
    }

    /**
     * Mark task as done (status = 8)
     */
    async markDone(taskGuid) {
        return this.setTaskStatus(taskGuid, 8);
    }

    /**
     * Mark task as in-progress (status = 1)
     */
    async markInProgress(taskGuid) {
        return this.setTaskStatus(taskGuid, 1);
    }

    // =========================================================================
    // Time Scheduling (Phase 2)
    // =========================================================================

    /**
     * Format for time children: "Wed Jan 7 15:00 — Wed Jan 7 16:00"
     */
    formatTimeRange(start, end) {
        const formatDate = (d) => {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const day = days[d.getDay()];
            const month = months[d.getMonth()];
            const date = d.getDate();
            const hours = d.getHours().toString().padStart(2, '0');
            const mins = d.getMinutes().toString().padStart(2, '0');
            return `${day} ${month} ${date} ${hours}:${mins}`;
        };
        return `${formatDate(start)} — ${formatDate(end)}`;
    }

    /**
     * Parse time range from child text.
     * Returns { start: Date, end: Date } or null.
     */
    parseTimeRange(text) {
        // Match: "Wed Jan 7 15:00 — Wed Jan 7 16:00"
        const pattern = /(\w{3}) (\w{3}) (\d{1,2}) (\d{2}):(\d{2}) — (\w{3}) (\w{3}) (\d{1,2}) (\d{2}):(\d{2})/;
        const match = text.match(pattern);
        if (!match) return null;

        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
                        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

        const year = new Date().getFullYear();
        const startMonth = months[match[2]];
        const startDate = parseInt(match[3]);
        const startHour = parseInt(match[4]);
        const startMin = parseInt(match[5]);

        const endMonth = months[match[7]];
        const endDate = parseInt(match[8]);
        const endHour = parseInt(match[9]);
        const endMin = parseInt(match[10]);

        return {
            start: new Date(year, startMonth, startDate, startHour, startMin),
            end: new Date(year, endMonth, endDate, endHour, endMin)
        };
    }

    /**
     * Get task's scheduled time by finding its time child.
     * @returns {{ start: Date, end: Date, childGuid: string }} or null
     */
    async getTaskSchedule(taskGuid) {
        const journal = await this.getTodayJournal();
        if (!journal) return null;

        try {
            const items = await journal.getLineItems();
            // Find children of this task
            const children = items.filter(i => i.parent_guid === taskGuid);

            for (const child of children) {
                if (child.type !== 'text') continue;
                const segments = child.segments || [];
                const text = segments.map(s => s.type === 'text' ? (s.text || '') : '').join('');
                const timeRange = this.parseTimeRange(text);
                if (timeRange) {
                    return { ...timeRange, childGuid: child.guid };
                }
            }
            return null;
        } catch (e) {
            console.error('[PlannerHub] Error getting task schedule:', e);
            return null;
        }
    }

    /**
     * Schedule a task by creating/updating its time child.
     * @param {string} taskGuid - The task GUID
     * @param {Date|string} start - Start time (Date or "HH:MM")
     * @param {Date|string} [end] - End time (defaults to start + 1hr)
     */
    async scheduleTask(taskGuid, start, end = null) {
        const journal = await this.getTodayJournal();
        if (!journal) return false;

        try {
            const items = await journal.getLineItems();
            const task = items.find(i => i.guid === taskGuid);
            if (!task) return false;

            // Parse start time
            let startDate;
            if (start instanceof Date) {
                startDate = start;
            } else if (typeof start === 'string') {
                // Parse "HH:MM" format
                const [hours, mins] = start.split(':').map(Number);
                startDate = new Date();
                startDate.setHours(hours, mins, 0, 0);
            } else {
                return false;
            }

            // Parse or calculate end time
            let endDate;
            if (end instanceof Date) {
                endDate = end;
            } else if (typeof end === 'string') {
                const [hours, mins] = end.split(':').map(Number);
                endDate = new Date();
                endDate.setHours(hours, mins, 0, 0);
            } else {
                // Default: start + 1 hour
                endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
            }

            const timeText = this.formatTimeRange(startDate, endDate);

            // Find any existing text child under task (reuse even if empty)
            const children = items.filter(i => i.parent_guid === taskGuid && i.type === 'text');
            if (children.length > 0) {
                // Reuse the first text child
                children[0].setSegments([{ type: 'text', text: timeText }]);
                return true;
            }

            // Create new time child under task
            const newChild = await journal.createLineItem(task, null, 'text');
            if (newChild) {
                newChild.setSegments([{ type: 'text', text: timeText }]);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[PlannerHub] Error scheduling task:', e);
            return false;
        }
    }

    /**
     * Remove schedule from a task (clear time child).
     */
    async unscheduleTask(taskGuid) {
        const journal = await this.getTodayJournal();
        if (!journal) return false;

        try {
            const existing = await this.getTaskSchedule(taskGuid);
            if (!existing) return true; // Already unscheduled

            const items = await journal.getLineItems();
            const child = items.find(i => i.guid === existing.childGuid);
            if (child) {
                // Can't delete, so clear segments
                child.setSegments([]);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[PlannerHub] Error unscheduling task:', e);
            return false;
        }
    }

    // =========================================================================
    // Timeline View (Phase 2)
    // =========================================================================

    /**
     * Get tasks that have explicit time schedules.
     */
    async getScheduledTasks() {
        const tasks = await this.getPlannerHubTasks();
        const scheduled = [];

        for (const task of tasks) {
            const schedule = await this.getTaskSchedule(task.guid);
            if (schedule) {
                scheduled.push({
                    ...task,
                    start: schedule.start,
                    end: schedule.end,
                    type: 'scheduled'
                });
            }
        }

        // Sort by start time
        scheduled.sort((a, b) => a.start.getTime() - b.start.getTime());
        return scheduled;
    }

    /**
     * Get tasks without explicit time schedules.
     */
    async getUnscheduledTasks() {
        const tasks = await this.getPlannerHubTasks();
        const unscheduled = [];

        for (const task of tasks) {
            const schedule = await this.getTaskSchedule(task.guid);
            if (!schedule) {
                unscheduled.push({
                    ...task,
                    type: 'unscheduled'
                });
            }
        }

        return unscheduled;
    }

    /**
     * Get unified timeline view with auto-fill for unscheduled tasks.
     * @param {Object} opts - Options
     * @param {string} opts.workdayStart - Start of workday (default "09:00")
     * @param {string} opts.workdayEnd - End of workday (default "18:00")
     * @param {number} opts.defaultDuration - Default task duration in minutes (default 60)
     * @param {boolean} opts.includeCalendar - Merge calendar events (default true)
     * @param {boolean} opts.includeCompleted - Include done tasks (default false)
     */
    async getTimelineView(opts = {}) {
        const {
            workdayStart = '09:00',
            workdayEnd = '18:00',
            defaultDuration = 60,
            includeCalendar = true,
            includeCompleted = false
        } = opts;

        // Parse workday bounds
        const [startH, startM] = workdayStart.split(':').map(Number);
        const [endH, endM] = workdayEnd.split(':').map(Number);
        const today = new Date();
        const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startH, startM);
        const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endH, endM);

        // Collect all blocked time slots
        const blockedSlots = [];

        // 1. Get scheduled tasks
        const scheduled = await this.getScheduledTasks();
        for (const task of scheduled) {
            if (!includeCompleted && task.status === 'done') continue;
            blockedSlots.push({
                ...task,
                type: 'scheduled'
            });
        }

        // 2. Get calendar events (if available and requested)
        if (includeCalendar && window.calendarHub?.getTodayEvents) {
            try {
                const events = await window.calendarHub.getTodayEvents();
                for (const event of events) {
                    blockedSlots.push({
                        guid: event.guid,
                        text: event.title || event.text,
                        start: new Date(event.start),
                        end: new Date(event.end),
                        type: 'calendar',
                        calendarEvent: event
                    });
                }
            } catch (e) {
                // Calendar not available, continue without it
            }
        }

        // Sort blocked slots by start time
        blockedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

        // 3. Get unscheduled tasks
        let unscheduled = await this.getUnscheduledTasks();
        if (!includeCompleted) {
            unscheduled = unscheduled.filter(t => t.status !== 'done');
        }

        // 4. Find gaps and place unscheduled tasks
        const timeline = [...blockedSlots];
        let currentTime = dayStart.getTime();

        for (const task of unscheduled) {
            // Find next gap
            let placed = false;

            while (currentTime < dayEnd.getTime() && !placed) {
                const slotStart = new Date(currentTime);
                const slotEnd = new Date(currentTime + defaultDuration * 60 * 1000);

                // Check if this slot conflicts with any blocked slot
                const conflict = blockedSlots.find(b =>
                    (slotStart < b.end && slotEnd > b.start)
                );

                if (conflict) {
                    // Move past this conflict
                    currentTime = conflict.end.getTime();
                } else {
                    // Place task here
                    timeline.push({
                        ...task,
                        start: slotStart,
                        end: slotEnd,
                        type: 'auto'
                    });
                    currentTime = slotEnd.getTime();
                    placed = true;
                }
            }

            // If couldn't place within workday, add at end as overflow
            if (!placed) {
                const overflowStart = new Date(currentTime);
                const overflowEnd = new Date(currentTime + defaultDuration * 60 * 1000);
                timeline.push({
                    ...task,
                    start: overflowStart,
                    end: overflowEnd,
                    type: 'overflow'
                });
                currentTime = overflowEnd.getTime();
            }
        }

        // Sort final timeline by start time
        timeline.sort((a, b) => a.start.getTime() - b.start.getTime());

        return timeline;
    }

    // =========================================================================
    // Move Task After (Phase 2)
    // =========================================================================

    /**
     * Move a task to be after another task in the list.
     * For unscheduled tasks, this changes their order.
     * @param {string} taskGuid - Task to move
     * @param {string} afterGuid - Task to place after (null = move to top)
     */
    async moveTaskAfter(taskGuid, afterGuid) {
        // For now, we use swap-based reordering
        // This moves taskGuid to be immediately after afterGuid
        const journal = await this.getTodayJournal();
        if (!journal) return false;

        try {
            const { sectionItems } = await this.findOrCreatePlannerSection(journal);

            // Find current positions
            const taskIndex = sectionItems.findIndex(i => i.guid === taskGuid);
            const afterIndex = afterGuid
                ? sectionItems.findIndex(i => i.guid === afterGuid)
                : -1;

            if (taskIndex === -1) return false;
            if (afterGuid && afterIndex === -1) return false;

            // Target position is afterIndex + 1
            const targetIndex = afterIndex + 1;

            if (taskIndex === targetIndex) return true; // Already in position

            // Swap step by step to move task to target
            if (taskIndex > targetIndex) {
                // Move up: swap with each item above until in position
                for (let i = taskIndex; i > targetIndex; i--) {
                    const guidA = sectionItems[i].guid;
                    const guidB = sectionItems[i - 1].guid;
                    await this.swapPlanTasksByGuid(guidA, guidB);
                }
            } else {
                // Move down: swap with each item below until in position
                for (let i = taskIndex; i < targetIndex - 1; i++) {
                    const guidA = sectionItems[i].guid;
                    const guidB = sectionItems[i + 1].guid;
                    await this.swapPlanTasksByGuid(guidA, guidB);
                }
            }

            return true;
        } catch (e) {
            console.error('[PlannerHub] Error moving task:', e);
            return false;
        }
    }

    // =========================================================================
    // Add to Today
    // =========================================================================

    async addToToday(text, issueGuid = null) {
        const journal = await this.getTodayJournal();
        if (!journal) {
            console.error('[PlannerHub] No journal found for today');
            return false;
        }

        try {
            // Build segments
            const segments = [];

            if (issueGuid) {
                segments.push({ type: 'text', text: 'work on ' });
                segments.push({ type: 'ref', text: { guid: issueGuid } });
            } else if (text) {
                segments.push({ type: 'text', text: text });
            } else {
                console.error('[PlannerHub] No text or issueGuid provided');
                return false;
            }

            // Find or create PlannerHub section
            const { headingItem, lastSectionItem, sectionItems } = await this.findOrCreatePlannerSection(journal);

            // Create new task as CHILD of heading (not sibling)
            // If section has items, insert after the last one; otherwise insert as first child
            const afterItem = sectionItems.length > 0 ? lastSectionItem : null;
            const newItem = await journal.createLineItem(headingItem, afterItem, 'task');
            if (newItem) {
                newItem.setSegments(segments);
                return true;
            } else {
                console.error('[PlannerHub] createLineItem returned null');
                return false;
            }
        } catch (e) {
            console.error('[PlannerHub] Error adding task:', e);
            return false;
        }
    }

    // =========================================================================
    // Add Task to Plan (Transclude)
    // =========================================================================

    /**
     * Add a task from any journal to today's plan by creating a transclusion.
     * Creates a ref to the original task in the PlannerHub section.
     */
    async addTaskToPlan(taskGuid) {
        const journal = await this.getTodayJournal();
        if (!journal) {
            console.error('[PlannerHub] No journal found for today');
            return false;
        }

        try {
            // Find or create PlannerHub section
            const { headingItem, lastSectionItem, sectionItems } = await this.findOrCreatePlannerSection(journal);

            // Create a transclusion as CHILD of heading
            const afterItem = sectionItems.length > 0 ? lastSectionItem : null;
            const newItem = await journal.createLineItem(headingItem, afterItem, 'ref');
            if (newItem) {
                // Set the itemref to point to the original task
                newItem.setMetaProperties({ itemref: taskGuid });
                return true;
            } else {
                console.error('[PlannerHub] createLineItem returned null');
                return false;
            }
        } catch (e) {
            console.error('[PlannerHub] Error adding task to plan:', e);
            return false;
        }
    }

    /**
     * Add all incomplete tasks from a journal day to today's plan.
     */
    async addAllToPlan(daysBack) {
        const tasks = await this.getJournalTasks(daysBack);
        const incompleteTasks = tasks.filter(t => t.status !== 'done');

        let added = 0;
        for (const task of incompleteTasks) {
            const success = await this.addTaskToPlan(task.guid);
            if (success) added++;
        }

        return added;
    }

    // =========================================================================
    // Unplan Task (Remove from Today)
    // =========================================================================

    /**
     * Remove a task from today that links to a specific issue.
     * Clears the task's segments (can't delete).
     */
    async unplanTask(issueGuid) {
        const journal = await this.getTodayJournal();
        if (!journal) return false;

        try {
            const items = await journal.getLineItems();

            // Find task that links to this issue
            for (const item of items) {
                if (item.type !== 'task') continue;

                const segments = item.segments || [];
                for (const seg of segments) {
                    if (seg.type === 'ref' && seg.text?.guid === issueGuid) {
                        // Found the task - clear it
                        item.setSegments([]);
                        return true;
                    }
                }
            }

            return false;
        } catch (e) {
            console.error('[PlannerHub] Error unplanning task:', e);
            return false;
        }
    }

    // =========================================================================
    // What's Next
    // =========================================================================

    async getWhatsNext() {
        const tasks = await this.getTodayTasks();
        const nextTask = tasks.find(t => t.status !== 'done');

        if (nextTask) {
            // If linked to issue, get issue details
            if (nextTask.linkedIssueGuid) {
                const issuesCollection = await this.getIssuesCollection();
                if (issuesCollection) {
                    const records = await issuesCollection.getAllRecords();
                    const issue = records.find(r => r.guid === nextTask.linkedIssueGuid);
                    if (issue) {
                        nextTask.issueTitle = issue.getName();
                        nextTask.issueUrl = issue.text('url');
                    }
                }
            }
            return nextTask;
        }

        // No tasks in journal - suggest from Doing issues
        const { doing } = await this.getAllPlanningIssues();
        if (doing.length > 0) {
            return {
                suggestion: true,
                issue: doing[0],
                message: `No tasks planned. Consider: "${doing[0].title}"`,
            };
        }

        return null;
    }

    // =========================================================================
    // Monthly Notes
    // =========================================================================

    async getOrCreateCurrentMonth() {
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long' });
        const year = now.getFullYear();
        const title = `${monthName} ${year}`;

        const records = await this.myCollection.getAllRecords();
        let monthRecord = records.find(r => r.getName() === title);

        if (!monthRecord) {
            // Create new month record
            const guid = this.myCollection.createRecord(title);
            await new Promise(r => setTimeout(r, 50));
            const allRecords = await this.myCollection.getAllRecords();
            monthRecord = allRecords.find(r => r.guid === guid);

            if (monthRecord) {
                monthRecord.prop('month')?.set(monthName);
                monthRecord.prop('year')?.set(year);
            }
        }

        return monthRecord;
    }

    // =========================================================================
    // Planner View
    // =========================================================================

    registerPlannerView() {
        this.views.register("Planner", (viewContext) => {
            const element = viewContext.getElement();
            let container = null;
            let daysBack = 0; // Start with today's note
            let dailyNoteTasks = []; // Cache for daily note tasks
            let listenerAttached = false; // Prevent duplicate listeners

            const render = async () => {
                if (!container) return;

                const planTasks = await this.getPlannerHubTasks();
                const { doing, next } = await this.getAllPlanningIssues();
                dailyNoteTasks = await this.getJournalTasks(daysBack);

                const todayDate = new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                });

                // Format the daily note date
                const noteDate = new Date();
                noteDate.setDate(noteDate.getDate() - daysBack);
                const noteDateStr = daysBack === 0 ? 'Today' : noteDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });

                const doneTasks = planTasks.filter(t => t.done).length;
                const totalTasks = planTasks.length;

                // Collect GUIDs that are already in today's plan
                const plannedTaskGuids = new Set(planTasks.map(t => t.guid));
                const plannedIssueGuids = new Set(
                    planTasks
                        .filter(t => t.linkedIssueGuid)
                        .map(t => t.linkedIssueGuid)
                );

                container.innerHTML = `
                    <div class="planner-header">
                        <div class="planner-title">
                            <span class="ti ti-calendar-time planner-title-icon"></span>
                            <span>Planner</span>
                            <span class="planner-date">${todayDate}</span>
                        </div>
                        <div class="planner-actions">
                            <button class="planner-btn" data-action="refresh">
                                <span class="ti ti-refresh"></span>
                                Refresh
                            </button>
                        </div>
                    </div>

                    <div class="planner-kanban">
                        ${this.renderPlanColumn(planTasks)}
                        ${this.renderIssueColumn('doing', 'Doing', doing, 'ti-progress', plannedIssueGuids)}
                        ${this.renderIssueColumn('next', 'Next', next, 'ti-list-check', plannedIssueGuids)}
                        ${this.renderDailyNoteColumn(dailyNoteTasks, noteDateStr, daysBack, plannedTaskGuids)}
                    </div>

                    <div class="planner-footer">
                        <div class="planner-stat">
                            <span class="planner-stat-value">${totalTasks}</span>
                            <span>in plan</span>
                        </div>
                        <div class="planner-stat">
                            <span class="planner-stat-value">${doneTasks}</span>
                            <span>completed</span>
                        </div>
                        <div class="planner-stat">
                            <span class="planner-stat-value">${doing.length + next.length}</span>
                            <span>issues queued</span>
                        </div>
                        <div class="planner-stat">
                            <span class="planner-stat-value">${dailyNoteTasks.filter(t => t.status !== 'done').length}</span>
                            <span>in daily note</span>
                        </div>
                    </div>
                `;

                // Only attach listener once!
                if (!listenerAttached) {
                    this.wireActions(container, render, () => dailyNoteTasks, (newDaysBack) => {
                        daysBack = newDaysBack;
                        render();
                    });
                    listenerAttached = true;
                }
            };

            return {
                onLoad: () => {
                    viewContext.makeWideLayout();
                    element.style.height = '100%';
                    element.style.overflow = 'auto';
                    container = document.createElement('div');
                    container.className = 'planner-view';
                    element.appendChild(container);
                    render();
                },
                onRefresh: () => render(),
                onDestroy: () => { container = null; listenerAttached = false; },
                onFocus: () => {},
                onBlur: () => {},
                onPanelResize: () => {},
                onKeyboardNavigation: () => {}
            };
        });
    }

    renderPlanColumn(tasks) {
        const cardsHtml = tasks.length > 0
            ? tasks.map((task, index) => this.renderTaskCard(task, index, tasks.length)).join('')
            : `<div class="planner-empty">
                   <div class="planner-empty-icon ti ti-checkbox"></div>
                   <div>No tasks planned</div>
               </div>`;

        return `
            <div class="planner-column">
                <div class="planner-column-header">
                    <div class="planner-column-title plan">
                        <span class="ti ti-calendar-check"></span>
                        Today's Plan
                    </div>
                    <span class="planner-column-count">${tasks.length}</span>
                </div>
                <div class="planner-column-body" data-column="plan">
                    ${cardsHtml}
                </div>
            </div>
        `;
    }

    renderDailyNoteColumn(tasks, dateStr, daysBack, plannedGuids) {
        // Filter out completed and already-planned tasks for the add all count
        const addableTasks = tasks.filter(t => t.status !== 'done' && !plannedGuids.has(t.guid));

        const cardsHtml = tasks.length > 0
            ? tasks.map(task => this.renderDailyNoteTaskCard(task, plannedGuids.has(task.guid))).join('')
            : `<div class="planner-empty">
                   <div class="planner-empty-icon ti ti-notebook"></div>
                   <div>No tasks in this note</div>
               </div>`;

        return `
            <div class="planner-column">
                <div class="planner-column-header">
                    <div class="planner-column-title daily-note">
                        <span class="ti ti-notebook"></span>
                        Daily Note
                    </div>
                    <div class="planner-day-nav" data-daysback="${daysBack}">
                        <button class="planner-day-nav-btn" data-action="prev-day" title="Earlier">
                            <span class="ti ti-chevron-left"></span>
                        </button>
                        <span class="planner-day-label">${dateStr}</span>
                        <button class="planner-day-nav-btn" data-action="next-day" ${daysBack <= 0 ? 'disabled' : ''} title="Later">
                            <span class="ti ti-chevron-right"></span>
                        </button>
                    </div>
                </div>
                <div class="planner-column-body" data-column="daily-note">
                    ${addableTasks.length > 0 ? `
                        <button class="planner-add-all-btn" data-action="add-all" data-daysback="${daysBack}">
                            <span class="ti ti-plus"></span>
                            Add all ${addableTasks.length} to plan
                        </button>
                    ` : ''}
                    ${cardsHtml}
                </div>
            </div>
        `;
    }

    renderDailyNoteTaskCard(task, isInPlan) {
        let titleHtml = '';
        if (task.text) {
            titleHtml = this.escapeHtml(task.text);
        }
        if (task.linkedIssueTitle) {
            const linkedHtml = `<span class="planner-link">${this.escapeHtml(task.linkedIssueTitle)}</span>`;
            titleHtml += (titleHtml ? ' ' : '') + linkedHtml;
        }
        if (!titleHtml) {
            titleHtml = '<span class="planner-empty-task">(empty task)</span>';
        }

        const isDone = task.status === 'done';
        const cardClass = `planner-card daily-note-task ${isDone ? 'done' : ''} ${isInPlan ? 'in-plan' : ''}`;
        const showAddButton = !isDone && !isInPlan;

        return `
            <div class="${cardClass}" data-guid="${task.guid}" data-type="daily-note-task">
                <div class="planner-card-header">
                    <div class="planner-card-checkbox" ${isDone ? 'style="pointer-events:none"' : ''}></div>
                    <div class="planner-card-title">${titleHtml}</div>
                    ${showAddButton ? `
                        <div class="planner-card-actions">
                            <button class="planner-card-action" data-action="add-to-plan" title="Add to Plan">
                                <span class="ti ti-plus"></span>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="planner-card-meta">
                    <span>${isInPlan ? 'In plan' : (task.daysBack === 0 ? 'Today' : (task.daysBack === 1 ? 'Yesterday' : task.daysBack + ' days ago'))}</span>
                </div>
            </div>
        `;
    }

    renderColumn(id, title, tasks, icon) {
        const cardsHtml = tasks.length > 0
            ? tasks.map(task => this.renderTaskCard(task)).join('')
            : `<div class="planner-empty">
                   <div class="planner-empty-icon ti ti-checkbox"></div>
                   <div>No tasks yet</div>
               </div>`;

        return `
            <div class="planner-column">
                <div class="planner-column-header">
                    <div class="planner-column-title ${id}">
                        <span class="ti ${icon}"></span>
                        ${title}
                    </div>
                    <span class="planner-column-count">${tasks.length}</span>
                </div>
                <div class="planner-column-body" data-column="${id}">
                    ${cardsHtml}
                </div>
            </div>
        `;
    }

    renderIssueColumn(id, title, issues, icon, plannedIssueGuids = new Set()) {
        // Sort: unplanned first, planned at the end
        const sortedIssues = [...issues].sort((a, b) => {
            const aPlanned = plannedIssueGuids.has(a.guid);
            const bPlanned = plannedIssueGuids.has(b.guid);
            if (aPlanned === bPlanned) return 0;
            return aPlanned ? 1 : -1;
        });

        const cardsHtml = sortedIssues.length > 0
            ? sortedIssues.map(issue => this.renderIssueCard(issue, plannedIssueGuids.has(issue.guid))).join('')
            : `<div class="planner-empty">
                   <div class="planner-empty-icon ti ti-git-branch"></div>
                   <div>No ${title.toLowerCase()} issues</div>
               </div>`;

        return `
            <div class="planner-column">
                <div class="planner-column-header">
                    <div class="planner-column-title ${id}">
                        <span class="ti ${icon}"></span>
                        ${title}
                    </div>
                    <span class="planner-column-count">${issues.length}</span>
                </div>
                <div class="planner-column-body" data-column="${id}">
                    ${cardsHtml}
                </div>
            </div>
        `;
    }

    renderTaskCard(task, index = 0, total = 1) {
        // Build display title with styled linked issue
        let titleHtml = '';
        if (task.text) {
            titleHtml = this.escapeHtml(task.text);
        }
        if (task.linkedIssueTitle) {
            const linkedHtml = `<span class="planner-link">${this.escapeHtml(task.linkedIssueTitle)}</span>`;
            titleHtml += (titleHtml ? ' ' : '') + linkedHtml;
        }
        if (!titleHtml) {
            titleHtml = '<span class="planner-empty-task">(empty task)</span>';
        }

        const isFirst = index === 0;
        const isLast = index === total - 1;
        const isDone = task.status === 'done';

        return `
            <div class="planner-card task ${isDone ? 'done' : ''}" data-guid="${task.guid}" data-type="task" data-index="${index}">
                <div class="planner-card-header">
                    <div class="planner-card-checkbox" data-action="toggle"></div>
                    <div class="planner-card-title">${titleHtml}</div>
                    <div class="planner-card-reorder">
                        <button class="planner-reorder-btn" data-action="move-up" ${isFirst ? 'disabled' : ''} title="Move up">
                            <span class="ti ti-chevron-up"></span>
                        </button>
                        <button class="planner-reorder-btn" data-action="move-down" ${isLast ? 'disabled' : ''} title="Move down">
                            <span class="ti ti-chevron-down"></span>
                        </button>
                    </div>
                </div>
                <div class="planner-card-meta">
                    <span>Journal</span>
                </div>
            </div>
        `;
    }

    renderIssueCard(issue, isPlanned = false) {
        const repoName = issue.repo?.split('/').pop() || '';
        const plannedClass = isPlanned ? 'planned' : '';
        const actionIcon = isPlanned ? 'ti-x' : 'ti-plus';
        const actionName = isPlanned ? 'unplan' : 'add-to-today';
        const actionTitle = isPlanned ? 'Remove from Today' : 'Add to Today';

        return `
            <div class="planner-card issue ${plannedClass}" data-guid="${issue.guid}" data-type="issue">
                <div class="planner-card-header">
                    <div class="planner-card-title">${this.escapeHtml(issue.title)}</div>
                    <div class="planner-card-actions">
                        <button class="planner-card-action" data-action="${actionName}" title="${actionTitle}">
                            <span class="ti ${actionIcon}"></span>
                        </button>
                    </div>
                </div>
                <div class="planner-card-meta">
                    ${repoName ? `<span class="planner-card-repo"><span class="ti ti-git-branch"></span>${repoName}</span>` : ''}
                    ${issue.number ? `<span class="planner-card-number">#${issue.number}</span>` : ''}
                </div>
            </div>
        `;
    }

    wireActions(container, refresh, getDailyNoteTasks = () => [], setDaysBack = null) {
        container.addEventListener('click', async (e) => {
            // Get current tasks (may have changed since listener was attached)
            const dailyNoteTasks = typeof getDailyNoteTasks === 'function' ? getDailyNoteTasks() : getDailyNoteTasks;
            const actionEl = e.target.closest('[data-action]');
            const action = actionEl?.dataset.action;
            const card = e.target.closest('.planner-card');

            if (action === 'refresh') {
                e.stopPropagation();
                refresh();
                return;
            }

            // Day navigation for daily note column
            if (action === 'prev-day' && setDaysBack) {
                e.stopPropagation();
                const nav = container.querySelector('.planner-day-nav');
                const currentDaysBack = parseInt(nav?.dataset.daysback) || 0;
                setDaysBack(currentDaysBack + 1);
                return;
            }

            if (action === 'next-day' && setDaysBack) {
                e.stopPropagation();
                if (actionEl.disabled) return;
                const nav = container.querySelector('.planner-day-nav');
                const currentDaysBack = parseInt(nav?.dataset.daysback) || 0;
                if (currentDaysBack > 0) {
                    setDaysBack(currentDaysBack - 1);
                }
                return;
            }

            // Add all tasks to plan
            if (action === 'add-all') {
                e.stopPropagation();
                const daysBack = parseInt(actionEl.dataset.daysback) || 0;
                await this.addAllToPlan(daysBack);
                refresh();
                return;
            }

            if (!card) return;

            const guid = card.dataset.guid;
            const type = card.dataset.type;

            if (action === 'toggle' && type === 'task') {
                e.stopPropagation();
                await this.toggleTask(guid);
                refresh();
            } else if (action === 'add-to-today' && type === 'issue') {
                e.stopPropagation();
                await this.addToToday(null, guid);
                refresh();
            } else if (action === 'unplan' && type === 'issue') {
                e.stopPropagation();
                await this.unplanTask(guid);
                refresh();
            } else if (action === 'add-to-plan' && type === 'daily-note-task') {
                e.stopPropagation();
                await this.addTaskToPlan(guid);
                refresh();
            } else if (action === 'move-up' && type === 'task') {
                e.stopPropagation();
                // Find previous sibling card
                const prevCard = card.previousElementSibling;
                if (prevCard && prevCard.classList.contains('planner-card')) {
                    const prevGuid = prevCard.dataset.guid;
                    await this.swapPlanTasksByGuid(guid, prevGuid);
                    refresh();
                }
            } else if (action === 'move-down' && type === 'task') {
                e.stopPropagation();
                // Find next sibling card
                const nextCard = card.nextElementSibling;
                if (nextCard && nextCard.classList.contains('planner-card')) {
                    const nextGuid = nextCard.dataset.guid;
                    await this.swapPlanTasksByGuid(guid, nextGuid);
                    refresh();
                }
            }
        });
    }

    async toggleTask(guid) {
        const journal = await this.getTodayJournal();
        if (!journal) return;

        try {
            const items = await journal.getLineItems();
            const task = items.find(i => i.guid === guid);

            if (task) {
                const isDone = !!task.props?.done;
                if (task.setMetaProperties) {
                    task.setMetaProperties({ done: isDone ? null : Date.now() });
                }
            }
        } catch (e) {
            console.error('[PlannerHub] Error toggling task:', e);
        }
    }

    // =========================================================================
    // MCP Tools (via SyncHub)
    // =========================================================================

    registerWithSyncHub() {
        const register = () => {
            if (!window.syncHub?.registerCollectionTools) return;

            window.syncHub.registerCollectionTools({
                collection: 'PlannerHub',
                version: VERSION,
                description: 'Daily planning and task management',
                schema: {
                    guid: 'Task/Issue GUID',
                    text: 'Task text',
                    done: 'Completion status',
                    title: 'Issue title',
                    status: 'Issue status',
                },
                tools: [
                    {
                        name: 'today',
                        description: "Get today's tasks from the daily note",
                        parameters: {},
                        handler: async () => {
                            const tasks = await this.getTodayTasks();
                            return tasks.map(t => ({
                                guid: t.guid,
                                text: t.text,
                                done: t.done,
                                linkedIssue: t.linkedIssueGuid,
                            }));
                        }
                    },
                    {
                        name: 'whats_next',
                        description: 'Get the next task to work on',
                        parameters: {},
                        handler: async () => this.getWhatsNext()
                    },
                    {
                        name: 'add',
                        description: 'Add a task to today\'s daily note',
                        parameters: {
                            text: { type: 'string', description: 'Task text (optional if issue_guid provided)', optional: true },
                            issue_guid: { type: 'string', description: 'Issue GUID to link (creates "work on [[issue]]")', optional: true }
                        },
                        handler: async (args) => {
                            const success = await this.addToToday(args.text, args.issue_guid);
                            return { success };
                        }
                    },
                    {
                        name: 'issues_doing',
                        description: 'Get issues currently in progress',
                        parameters: {},
                        handler: async () => this.getIssuesByStatus('In Progress')
                    },
                    {
                        name: 'issues_next',
                        description: 'Get issues queued as Next',
                        parameters: {},
                        handler: async () => this.getIssuesByStatus('Next')
                    }
                ]
            });

            // Also register as hub for version tracking
            if (window.syncHub.registerHub) {
                window.syncHub.registerHub({
                    id: 'plannerhub',
                    name: 'PlannerHub',
                    version: VERSION
                });
            }

            console.log(`[PlannerHub] Registered MCP tools ${VERSION}`);
        };

        if (window.syncHub) {
            register();
        } else {
            window.addEventListener('synchub-ready', register, { once: true });
        }
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
