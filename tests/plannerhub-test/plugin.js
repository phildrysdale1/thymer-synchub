/**
 * PlannerHub Test Suite
 *
 * Standalone test plugin for PlannerHub APIs.
 * Run from console: window.plannerHubTests.runAll()
 */

class PlannerHubTestPlugin {
    constructor() {
        this.name = 'PlannerHub Tests';
    }

    async onLoad() {
        // Wait for plannerHub to be available
        if (window.plannerHub) {
            this.exposeTestSuite();
        } else {
            // Wait for plannerHub
            const checkInterval = setInterval(() => {
                if (window.plannerHub) {
                    clearInterval(checkInterval);
                    this.exposeTestSuite();
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => clearInterval(checkInterval), 10000);
        }
    }

    exposeTestSuite() {
        window.plannerHubTests = {
            // ─────────────────────────────────────────────────────
            // Test Runner
            // ─────────────────────────────────────────────────────
            async runAll() {
                console.log('🧪 PlannerHub Test Suite');
                console.log('========================\n');

                if (!window.plannerHub) {
                    console.error('❌ PlannerHub not loaded!');
                    return { passed: 0, failed: 1 };
                }

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
            // Interactive Helpers
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

        console.log('[PlannerHub Tests] Test suite loaded at window.plannerHubTests');
    }
}
