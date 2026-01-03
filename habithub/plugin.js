/**
 * HabitHub - Track habits and break vices
 *
 * Habit page logs are the source of truth. Multiple inputs:
 *   - Journal entries: [x] [[HabitName]] 30m
 *   - Dashboard buttons: +1/+10 quick log
 *   - Future: API, agents, automations
 *
 * All inputs write to habit logs. Stats calculated from logs.
 */

// Dashboard CSS
const DASHBOARD_CSS = `
    .habit-dashboard {
        padding: 24px;
        font-family: var(--font-family);
    }

    /* Quick Log Buttons */
    .habit-quick-log {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 24px;
    }
    .habit-quick-log-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--bg-hover);
        border: 1px solid var(--border-default);
        border-radius: 20px;
        color: var(--text-default);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .habit-quick-log-btn:hover {
        background: var(--bg-active);
        border-color: var(--enum-green-bg);
    }
    .habit-quick-log-btn .emoji {
        font-size: 16px;
    }

    /* Today Section */
    .habit-today {
        background: var(--bg-hover);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
    }
    .habit-today-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }
    .habit-today-title {
        font-weight: 600;
        color: var(--text-default);
    }
    .habit-today-progress {
        font-size: 14px;
        color: var(--text-muted);
    }
    .habit-today-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .habit-today-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.02);
        border-radius: 8px;
    }
    .habit-today-item[data-done="true"] {
        opacity: 0.6;
    }
    .habit-today-checkbox {
        width: 20px;
        height: 20px;
        border: 2px solid var(--border-default);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: transparent;
    }
    .habit-today-item[data-done="true"] .habit-today-checkbox {
        background: var(--enum-green-bg);
        border-color: var(--enum-green-bg);
        color: white;
    }
    .habit-today-item[data-kind="vice"] .habit-today-checkbox {
        border-color: var(--enum-orange-bg);
    }
    .habit-today-name {
        flex: 1;
        font-weight: 500;
    }
    .habit-today-target {
        font-size: 12px;
        color: var(--text-muted);
    }
    .habit-today-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: var(--text-muted);
    }
    .habit-today-item[data-done="true"] .habit-today-value {
        color: var(--enum-green-fg);
    }
    /* Fail status for vices over target */
    .habit-today-item[data-status="fail"] .habit-today-checkbox {
        background: var(--enum-red-bg);
        border-color: var(--enum-red-bg);
        color: white;
    }
    .habit-today-item[data-status="fail"] .habit-today-value {
        color: var(--enum-red-fg);
    }

    /* Section Title */
    .habit-section-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .habit-section-title::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border-default);
    }

    /* Card Grid */
    .habit-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
    }

    /* Habit Card */
    .habit-card {
        background: var(--bg-hover);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .habit-card:hover {
        border-color: rgba(255,255,255,0.15);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    /* Vice card colors based on today's value vs target */
    .habit-card.vice-green {
        background: linear-gradient(135deg, var(--bg-hover) 0%, rgba(76, 175, 80, 0.15) 100%);
        border-color: rgba(76, 175, 80, 0.3);
    }
    .habit-card.vice-green .habit-card-value {
        color: #4caf50;
    }
    .habit-card.vice-amber {
        background: linear-gradient(135deg, var(--bg-hover) 0%, rgba(255, 152, 0, 0.15) 100%);
        border-color: rgba(255, 152, 0, 0.3);
    }
    .habit-card.vice-amber .habit-card-value {
        color: #ff9800;
    }
    .habit-card.vice-red {
        background: linear-gradient(135deg, var(--bg-hover) 0%, rgba(218, 54, 51, 0.15) 100%);
        border-color: rgba(218, 54, 51, 0.3);
    }
    .habit-card.vice-red .habit-card-value {
        color: #da3633;
    }
    .habit-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
    }
    .habit-card-info {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .habit-card-emoji {
        font-size: 24px;
    }
    .habit-card-name {
        font-weight: 600;
        color: var(--text-default);
    }
    .habit-card-schedule {
        font-size: 11px;
        color: var(--text-muted);
    }
    .habit-card-streak {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
    }
    .habit-card-streak.fire {
        background: linear-gradient(135deg, #f97316, #ef4444);
        color: white;
    }
    .habit-card-streak.ice {
        background: linear-gradient(135deg, #06b6d4, #3b82f6);
        color: white;
    }
    .habit-card-streak.dormant {
        background: rgba(255,255,255,0.1);
        color: var(--text-muted);
    }
    .habit-card-body {
        text-align: center;
        padding: 12px 0;
    }
    .habit-card-value {
        font-size: 32px;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
        color: var(--enum-green-fg);
        line-height: 1;
    }
    /* Vice value colors now controlled by .vice-green/amber/red classes */
    .habit-card-unit {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 4px;
    }
    .habit-card-sparkline {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 2px;
        height: 32px;
        margin: 12px 0;
        padding: 0 4px;
    }
    .habit-sparkline-bar {
        flex: 1;
        background: rgba(63, 185, 80, 0.3);
        border-radius: 2px;
        min-height: 3px;
    }
    .habit-sparkline-bar.no-data {
        background: rgba(128, 128, 128, 0.2);
    }
    .habit-sparkline-bar.today {
        background: var(--enum-green-fg);
    }
    .habit-sparkline-bar.today.no-data {
        background: rgba(128, 128, 128, 0.4);
    }
    /* Vice sparkline colors */
    .habit-sparkline-bar.vice-green {
        background: rgba(76, 175, 80, 0.5);
    }
    .habit-sparkline-bar.vice-amber {
        background: rgba(255, 152, 0, 0.5);
    }
    .habit-sparkline-bar.vice-red {
        background: rgba(218, 54, 51, 0.5);
    }
    .habit-sparkline-bar.today.vice-green {
        background: #4caf50;
    }
    .habit-sparkline-bar.today.vice-amber {
        background: #ff9800;
    }
    .habit-sparkline-bar.today.vice-red {
        background: #da3633;
    }
    .habit-card-footer {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--text-muted);
        padding-top: 12px;
        border-top: 1px solid var(--border-default);
    }
    .habit-card-trend.up { color: var(--enum-green-fg); }
    .habit-card-trend.down { color: var(--enum-red-fg); }

    /* Summary Row */
    .habit-summary {
        background: var(--bg-default);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        padding: 14px 20px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 24px;
        font-size: 13px;
        color: var(--text-muted);
    }
    .habit-summary-item {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .habit-summary-value {
        font-weight: 600;
        color: var(--text-default);
    }

    /* Empty State */
    .habit-empty {
        text-align: center;
        padding: 60px 20px;
        color: var(--text-muted);
    }
    .habit-empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
    }
    .habit-empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-default);
        margin-bottom: 8px;
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

        // Inject CSS
        this.ui.injectCSS(DASHBOARD_CSS);

        // Register views
        this.registerDashboardView();
        this.registerAnalysisView();

        // Register commands
        this.registerCommands();

        console.log('[HabitHub] Loaded');
    }

    onUnload() {
        if (this.logHabitsCommand) this.logHabitsCommand.remove();
        if (this.syncCommand) this.syncCommand.remove();
    }

    // =========================================================================
    // Commands
    // =========================================================================

    registerCommands() {
        // Main "Log Habits" command
        this.logHabitsCommand = this.ui.addCommandPaletteCommand({
            label: 'Log Habits',
            icon: 'flame',
            onSelected: () => this.openLogDialog()
        });

        // Scan journal command
        this.syncCommand = this.ui.addCommandPaletteCommand({
            label: 'HabitHub: Sync Journal',
            icon: 'refresh',
            onSelected: () => this.syncJournalWithToast()
        });

        // Debug command to dump page props
        this.ui.addCommandPaletteCommand({
            label: 'HabitHub: Dump Page Props',
            icon: 'bug',
            onSelected: () => this.dumpPageProps()
        });

        // Repair logs command - re-sync props from text
        this.ui.addCommandPaletteCommand({
            label: 'HabitHub: Repair Logs',
            icon: 'tool',
            onSelected: () => this.repairLogs()
        });
    }

    async dumpPageProps() {
        const record = this.ui.getActivePanel()?.getActiveRecord();
        if (!record) {
            console.log('[HabitHub] No active record');
            return;
        }
        const lineItems = await record.getLineItems();
        console.log(`[HabitHub] === Props for "${record.getName()}" ===`);
        for (const item of lineItems) {
            const text = item.segments?.map(s => typeof s.text === 'string' ? s.text : '[obj]').join('') || '';
            console.log(`[HabitHub] ${item.type}: "${text.substring(0, 40)}" props:`, item.props);
        }
    }

    /**
     * Repair log entries by re-syncing props from text
     * For when someone ignores the flaming banner and edits anyway
     */
    async repairLogs() {
        const record = this.ui.getActivePanel()?.getActiveRecord();
        if (!record) {
            this.ui.addToaster({
                title: 'HabitHub',
                message: 'Open a habit page first',
                dismissible: true,
                autoDestroyTime: 2000,
            });
            return;
        }

        const lineItems = await record.getLineItems();
        let repaired = 0;
        let skipped = 0;

        for (const item of lineItems) {
            const text = item.segments?.map(s => typeof s.text === 'string' ? s.text : '').join('') || '';

            // Match log entry pattern: YYYY-MM-DD or YYYY-MM-DD - VALUE
            const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s*-\s*(\d+))?/);
            if (!match) {
                continue; // Not a log entry
            }

            const date = match[1];
            const value = match[2] ? parseInt(match[2], 10) : 1;

            // Check if props need repair
            const currentDate = item.props?.habit_date;
            const currentValue = item.props?.habit_value;

            if (currentDate !== date || currentValue !== value) {
                item.setMetaProperties({ habit_date: date, habit_value: value });
                repaired++;
                console.log(`[HabitHub] Repaired: ${date} = ${value}`);
            } else {
                skipped++;
            }
        }

        const message = repaired > 0
            ? `Repaired ${repaired} log entr${repaired === 1 ? 'y' : 'ies'}`
            : 'All logs OK, nothing to repair';

        this.ui.addToaster({
            title: 'HabitHub',
            message,
            dismissible: true,
            autoDestroyTime: 2000,
        });
    }

    async openLogDialog() {
        // For now, show a simple toast - full dialog implementation later
        this.ui.addToaster({
            title: 'HabitHub',
            message: 'Quick log dialog coming soon!',
            dismissible: true,
            autoDestroyTime: 2000,
        });
    }

    async syncJournalWithToast() {
        this.ui.addToaster({
            title: 'HabitHub',
            message: 'Scanning journal...',
            dismissible: true,
            autoDestroyTime: 1500,
        });

        try {
            const result = await this.scanJournalForHabits();
            if (result.processed > 0) {
                this.ui.addToaster({
                    title: 'HabitHub',
                    message: `Logged ${result.processed} habit${result.processed > 1 ? 's' : ''}`,
                    dismissible: true,
                    autoDestroyTime: 2000,
                });
            } else if (result.skipped > 0) {
                this.ui.addToaster({
                    title: 'HabitHub',
                    message: `${result.skipped} pending (check when done)`,
                    dismissible: true,
                    autoDestroyTime: 2000,
                });
            } else {
                this.ui.addToaster({
                    title: 'HabitHub',
                    message: 'No new habits to log',
                    dismissible: true,
                    autoDestroyTime: 2000,
                });
            }
        } catch (e) {
            console.error('[HabitHub] Sync error:', e);
            this.ui.addToaster({
                title: 'HabitHub',
                message: `Sync error: ${e.message}`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }
    }

    // =========================================================================
    // Dashboard View
    // =========================================================================

    registerDashboardView() {
        this.views.register("Dashboard", (viewContext) => {
            const element = viewContext.getElement();
            let records = [];
            let container = null;

            const renderDashboard = async () => {
                if (!container) return;
                container.innerHTML = '';

                // Get enabled habits
                const habits = records.filter(r => r.prop('enabled')?.choice() !== 'no');

                if (habits.length === 0) {
                    container.innerHTML = `
                        <div class="habit-empty">
                            <div class="habit-empty-icon">🔥</div>
                            <div class="habit-empty-title">No Habits Yet</div>
                            <div>Create a habit to start tracking</div>
                        </div>
                    `;
                    return;
                }

                // Quick log buttons (+1 and +10 per habit)
                const quickLog = document.createElement('div');
                quickLog.className = 'habit-quick-log';
                for (const habit of habits) {
                    const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());
                    const verb = habit.prop('verb')?.text() || habit.getName() || 'Habit';

                    // +1 button
                    const btn1 = document.createElement('button');
                    btn1.className = 'habit-quick-log-btn';
                    btn1.innerHTML = `<span class="emoji">${emoji}</span> +1 ${this.escapeHtml(verb)}`;
                    btn1.addEventListener('click', () => this.logHabit(habit, 1));
                    quickLog.appendChild(btn1);

                    // +10 button
                    const btn10 = document.createElement('button');
                    btn10.className = 'habit-quick-log-btn';
                    btn10.innerHTML = `<span class="emoji">${emoji}</span> +10 ${this.escapeHtml(verb)}`;
                    btn10.addEventListener('click', () => this.logHabit(habit, 10));
                    quickLog.appendChild(btn10);
                }
                container.appendChild(quickLog);

                // Pre-fetch stats for all habits (used for Today section and cards)
                const habitStats = new Map();
                for (const habit of habits) {
                    habitStats.set(habit.guid, await this.getHabitStats(habit));
                }

                // Today section
                const todaySection = document.createElement('div');
                todaySection.className = 'habit-today';

                // Calculate completion - vices: under target = success, habits: met target or logged
                const completedToday = habits.filter(h => {
                    const stats = habitStats.get(h.guid);
                    const kind = h.prop('kind')?.choice() || 'habit';
                    const target = h.prop('target')?.number() || 0;
                    const todayVal = stats?.todayTotal || 0;
                    if (kind === 'vice') {
                        return todayVal <= target; // Vice: under limit = success
                    } else {
                        return target > 0 ? todayVal >= target : todayVal > 0; // Habit: met target or logged
                    }
                }).length;

                todaySection.innerHTML = `
                    <div class="habit-today-header">
                        <div class="habit-today-title">Today's Habits</div>
                        <div class="habit-today-progress">${completedToday}/${habits.length} complete</div>
                    </div>
                    <div class="habit-today-list">
                        ${habits.map(habit => {
                            const stats = habitStats.get(habit.guid);
                            const todayValue = stats?.todayTotal || 0;
                            const kind = habit.prop('kind')?.choice() || 'habit';
                            const target = habit.prop('target')?.number() || 0;
                            const unit = habit.prop('unit')?.text() || '';
                            const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());

                            // Done logic: vice = under target, habit = met target or logged
                            let done, status;
                            if (kind === 'vice') {
                                done = todayValue <= target;
                                status = todayValue === 0 ? 'perfect' : (todayValue <= target ? 'pass' : 'fail');
                            } else {
                                done = target > 0 ? todayValue >= target : todayValue > 0;
                                status = done ? 'pass' : (todayValue > 0 ? 'partial' : 'none');
                            }

                            return `
                                <div class="habit-today-item" data-done="${done}" data-kind="${kind}" data-status="${status}">
                                    <div class="habit-today-checkbox">${done ? '✓' : (status === 'fail' ? '✗' : '')}</div>
                                    <span class="emoji">${emoji}</span>
                                    <div class="habit-today-name">${this.escapeHtml(habit.getName() || 'Habit')}</div>
                                    <div class="habit-today-target">${target ? `Target: ${target}${unit}` : ''}</div>
                                    <div class="habit-today-value">${todayValue || '—'}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                container.appendChild(todaySection);

                // Section title
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'habit-section-title';
                sectionTitle.textContent = 'This Week';
                container.appendChild(sectionTitle);

                // Habit cards grid + collect stats (reuse pre-fetched stats)
                const grid = document.createElement('div');
                grid.className = 'habit-grid';

                let totalBestStreak = 0;

                for (const habit of habits) {
                    const stats = habitStats.get(habit.guid);
                    const card = await this.renderHabitCard(habit, viewContext, stats);
                    grid.appendChild(card);

                    // Collect stats for summary
                    if (stats?.bestStreak > totalBestStreak) totalBestStreak = stats.bestStreak;
                }
                container.appendChild(grid);

                // Summary row (using calculated stats)
                const summary = document.createElement('div');
                summary.className = 'habit-summary';
                summary.innerHTML = `
                    <div class="habit-summary-item">
                        <span class="habit-summary-value">${habits.length}</span>
                        <span>habits</span>
                    </div>
                    <div class="habit-summary-item">
                        <span class="habit-summary-value">${completedToday}/${habits.length}</span>
                        <span>today</span>
                    </div>
                    <div class="habit-summary-item">
                        <span class="habit-summary-value">${totalBestStreak}</span>
                        <span>best streak</span>
                    </div>
                `;
                container.appendChild(summary);
            };

            let isRendering = false;

            return {
                onLoad: async () => {
                    viewContext.makeWideLayout();
                    element.style.overflow = 'auto';
                    container = document.createElement('div');
                    container.className = 'habit-dashboard';
                    element.appendChild(container);

                    // Trigger journal scan when dashboard opens (once)
                    await this.scanJournalForHabits();
                },
                onRefresh: async ({ records: newRecords }) => {
                    if (isRendering) return; // Prevent re-entrant rendering
                    isRendering = true;
                    try {
                        records = newRecords;
                        await renderDashboard();
                    } finally {
                        isRendering = false;
                    }
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

    async renderHabitCard(habit, viewContext, preloadedStats = null) {
        const name = habit.getName() || 'Habit';
        const kind = habit.prop('kind')?.choice() || 'habit';
        const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());
        const schedule = habit.prop('schedule')?.choice() || 'daily';
        const target = habit.prop('target')?.number() || 0;
        const weeklyTarget = habit.prop('weekly_target')?.number() || 0;
        const unit = habit.prop('unit')?.text() || '';

        // Calculate effective weekly target
        let effectiveWeeklyTarget = weeklyTarget;
        if (!effectiveWeeklyTarget && target) {
            // Calculate from daily target based on schedule
            const daysPerSchedule = { daily: 7, weekdays: 5, weekends: 2, weekly: 1 };
            effectiveWeeklyTarget = target * (daysPerSchedule[schedule] || 7);
        }

        // Use preloaded stats or fetch (source of truth is log entries)
        const stats = preloadedStats || await this.getHabitStats(habit);
        const { weeklyTotal, todayTotal, streak, logs } = stats;

        const card = document.createElement('div');
        card.className = 'habit-card';
        card.setAttribute('data-kind', kind);
        // Color class will be added after calculation

        // Determine streak badge style
        let streakClass = 'dormant';
        let streakIcon = '💤';
        let cardColorClass = '';

        if (kind === 'vice') {
            // Badge shows days under target
            if (streak > 0) {
                streakClass = 'ice';
                streakIcon = '🧊';
            }
        } else {
            // Habit: fire streak
            if (streak > 0) {
                streakClass = 'fire';
                streakIcon = '🔥';
            }
        }

        // Format value display
        let valueDisplay = weeklyTotal.toString();
        let unitDisplay = 'this week';
        if (kind === 'vice') {
            // For vices, show days below target this week (only count days with data)
            const weekDays = this.getWeekDays(7);
            let daysBelow = 0;
            let daysWithData = 0;
            for (const dayStr of weekDays) {
                const dayLog = logs?.find(l => l.date === dayStr);
                if (dayLog) {
                    daysWithData++;
                    if (dayLog.value <= target) {
                        daysBelow++;
                    }
                }
            }

            if (daysWithData > 0) {
                valueDisplay = `${daysBelow}/${daysWithData}`;
                unitDisplay = 'days below target';

                // Card color based on ratio of days with data
                const ratio = daysBelow / daysWithData;
                if (ratio >= 0.8) {
                    cardColorClass = 'vice-green';
                } else if (ratio >= 0.5) {
                    cardColorClass = 'vice-amber';
                } else {
                    cardColorClass = 'vice-red';
                }
            } else {
                valueDisplay = '—';
                unitDisplay = 'no data this week';
            }
        }

        // Add color class for vices
        if (cardColorClass) {
            card.classList.add(cardColorClass);
        }

        // Build sparkline data from logs (last 7 days)
        const sparklineData = this.buildSparklineData(logs, 7);

        card.innerHTML = `
            <div class="habit-card-header">
                <div class="habit-card-info">
                    <span class="habit-card-emoji">${emoji}</span>
                    <div>
                        <div class="habit-card-name">${this.escapeHtml(name)}</div>
                        <div class="habit-card-schedule">${schedule}${target ? ` • ${target}${unit}` : ''}</div>
                    </div>
                </div>
                <div class="habit-card-streak ${streakClass}">
                    <span>${streakIcon}</span>
                    <span>${streak}</span>
                </div>
            </div>
            <div class="habit-card-body">
                <div class="habit-card-value">${valueDisplay}</div>
                <div class="habit-card-unit">${unitDisplay}</div>
            </div>
            <div class="habit-card-sparkline">
                ${this.renderSparkline(7, sparklineData, kind, target)}
            </div>
            <div class="habit-card-footer">
                <span>${effectiveWeeklyTarget ? `◎ ${weeklyTotal}/${effectiveWeeklyTarget}${unit}` : ''}</span>
                <span class="habit-card-trend">—</span>
            </div>
        `;

        card.addEventListener('click', () => {
            viewContext.openRecordInOtherPanel(habit.guid);
        });

        return card;
    }

    /**
     * Build sparkline data array from log entries
     * Returns array of values for last N days, oldest first
     */
    buildSparklineData(logs, days) {
        const data = [];
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);

            // Find log entry for this date
            const log = logs?.find(l => l.date === dateStr);
            data.push(log?.value || 0);
        }

        return data;
    }

    renderSparkline(days, data = null, kind = 'habit', target = 0) {
        // If no data, show empty bars
        if (!data || data.length === 0 || data.every(v => v === 0)) {
            let html = '';
            for (let i = 0; i < days; i++) {
                const isToday = i === days - 1;
                html += `<div class="habit-sparkline-bar no-data${isToday ? ' today' : ''}" style="height: 3px"></div>`;
            }
            return html;
        }

        // Render actual data
        const maxVal = Math.max(...data, 1);
        let html = '';
        for (let i = 0; i < days; i++) {
            const val = data[i] || 0;
            const height = Math.max((val / maxVal) * 100, 3);
            const isToday = i === days - 1;

            // Determine color class
            let colorClass = '';
            if (val === 0) {
                colorClass = 'no-data';
            } else if (kind === 'vice' && target > 0) {
                const halfTarget = target / 2;
                if (val <= halfTarget) {
                    colorClass = 'vice-green';
                } else if (val <= target) {
                    colorClass = 'vice-amber';
                } else {
                    colorClass = 'vice-red';
                }
            }

            html += `<div class="habit-sparkline-bar${colorClass ? ' ' + colorClass : ''}${isToday ? ' today' : ''}" style="height: ${height}%"></div>`;
        }
        return html;
    }

    // =========================================================================
    // Analysis View
    // =========================================================================

    registerAnalysisView() {
        this.views.register("Analysis", (viewContext) => {
            const element = viewContext.getElement();
            let container = null;

            return {
                onLoad: () => {
                    viewContext.makeWideLayout();
                    element.style.overflow = 'auto';
                    container = document.createElement('div');
                    container.className = 'habit-dashboard';
                    container.innerHTML = `
                        <div class="habit-empty">
                            <div class="habit-empty-icon">📊</div>
                            <div class="habit-empty-title">Analysis View</div>
                            <div>Trends, graphs, and heatmaps coming soon!</div>
                        </div>
                    `;
                    element.appendChild(container);
                },
                onRefresh: () => {},
                onPanelResize: () => {},
                onDestroy: () => { container = null; },
                onFocus: () => {},
                onBlur: () => {},
                onKeyboardNavigation: () => {}
            };
        });
    }

    // =========================================================================
    // Journal Scanning
    // =========================================================================

    /**
     * Scan today's journal for habit entries and process them
     * Pattern: NUMBER [[habit]] or [x] NUMBER [[habit]] or [[habit]]
     * Skips: [ ] [[habit]] (unchecked = planned, not done)
     *
     * After processing, replaces with: ✓ logged VALUE HABITNAME EMOJI REMAINING to go
     */
    async scanJournalForHabits() {
        const journal = await this.getTodayJournal();
        if (!journal) {
            console.log('[HabitHub] No journal found for today');
            return { processed: 0, skipped: 0 };
        }

        // Get all habits for lookup
        const allRecords = await this.myCollection.getAllRecords();
        const habitsByGuid = new Map();
        for (const habit of allRecords) {
            habitsByGuid.set(habit.guid, habit);
        }

        // Track what we've logged today (to calculate remaining)
        const todayTotals = new Map(); // habitGuid -> total value logged today

        const lineItems = await journal.getLineItems();
        let processed = 0;
        let skipped = 0;

        for (const item of lineItems) {
            const result = await this.processLineItem(item, habitsByGuid, todayTotals);
            if (result === 'processed') processed++;
            else if (result === 'skipped') skipped++;
        }

        console.log(`[HabitHub] Scan complete: ${processed} processed, ${skipped} skipped`);
        return { processed, skipped };
    }

    /**
     * Process a single line item, looking for habit links
     * Returns: 'processed' | 'skipped' | 'ignored'
     */
    async processLineItem(item, habitsByGuid, todayTotals) {
        const segments = item.segments || [];
        const firstText = segments[0]?.text || '';

        // Check if already processed (starts with ✓) - count value but don't reprocess
        if (typeof firstText === 'string' && firstText.startsWith('✓')) {
            // Extract value from processed text: "✓ 20 Pushups..." → 20
            const match = firstText.match(/✓\s*(\d+)/);
            if (match) {
                const value = parseFloat(match[1]);
                // Find which habit this was by name
                const habitName = firstText.match(/✓\s*(?:\d+\s+)?(\w+)/)?.[1];
                for (const [guid, habit] of habitsByGuid) {
                    if (habit.getName() === habitName) {
                        const currentTotal = todayTotals.get(guid) || 0;
                        todayTotals.set(guid, currentTotal + value);
                        break;
                    }
                }
            }
            return 'ignored';
        }

        // Find ref segment (link to a habit)
        const refSegment = segments.find(s => s.type === 'ref');
        if (!refSegment) return 'ignored';

        // Get the linked guid
        const linkedGuid = refSegment.text?.guid;
        if (!linkedGuid) return 'ignored';

        // Check if it's a habit we track
        const habit = habitsByGuid.get(linkedGuid);
        if (!habit) return 'ignored'; // Link to something else, not a habit

        // Check if this is an unchecked task - skip those
        if (item.type === 'task' && !item.props?.done) {
            return 'skipped'; // [ ] = planned, not committed
        }

        // Extract value from segments (number before or after the link)
        const value = this.extractValueFromSegments(segments, refSegment);

        // Calculate remaining for today
        const habitName = habit.getName() || 'Habit';
        const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());
        const target = habit.prop('target')?.number() || 0;
        const unit = habit.prop('unit')?.text() || '';
        const kind = habit.prop('kind')?.choice() || 'habit';

        // Update today's total for this habit
        const currentTotal = todayTotals.get(linkedGuid) || 0;
        const newTotal = currentTotal + (value || 1);
        todayTotals.set(linkedGuid, newTotal);

        // Build the replacement summary
        const summary = this.buildSummaryText(habitName, emoji, value, unit, target, newTotal, kind);

        // Replace the line item content
        const newSegments = [{ type: 'text', text: summary }];
        item.setSegments(newSegments);

        // Write to habit page log (stats calculated from log entries)
        await this.appendToHabitLog(habit, value || 1, unit);

        return 'processed';
    }

    /**
     * Extract numeric value from segments around a ref
     * Looks for patterns like: "20 " before ref, or " 30m" after ref
     */
    extractValueFromSegments(segments, refSegment) {
        let value = null;

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];

            if (seg.type === 'text' && typeof seg.text === 'string') {
                // Look for numbers in text
                const match = seg.text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|h|hr|hrs)?/i);
                if (match) {
                    value = parseFloat(match[1]);
                    break;
                }
            }
        }

        return value;
    }

    /**
     * Update habit page log with today's running total
     * Format: 2025-01-02 - 40 (one entry per day, accumulates)
     */
    async appendToHabitLog(habit, value, unit) {
        try {
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const lineItems = await habit.getLineItems();

            // Find Log heading and today's entry (by props, not text parsing!)
            let logHeading = null;
            let todayEntry = null;

            for (const item of lineItems) {
                if (item.type === 'heading') {
                    const text = item.segments?.map(s => s.text || '').join('') || '';
                    if (text === 'Log') logHeading = item;
                }
                // Find today's entry by props - instant lookup!
                if (item.props?.habit_date === today) {
                    todayEntry = item;
                }
            }

            // Calculate new total for today (read from props if exists)
            let todayTotal = value || 1;
            if (todayEntry && todayEntry.props?.habit_value) {
                todayTotal = todayEntry.props.habit_value + (value || 1);
            }

            // Build entry text (human readable, but props are source of truth)
            const logEntry = todayTotal > 1 ? `${today} - ${todayTotal}${unit}` : `${today}`;

            if (todayEntry) {
                // Update existing entry - update both text and props
                todayEntry.setSegments([{ type: 'text', text: logEntry }]);
                todayEntry.setMetaProperties({ habit_date: today, habit_value: todayTotal });
                console.log('[HabitHub] Updated log:', logEntry, 'props:', { habit_date: today, habit_value: todayTotal });
            } else if (window.syncHub?.insertMarkdown) {
                // Create new entry
                if (!logHeading) {
                    // No log section yet - create warning banner + heading + entry
                    // First create the flaming "DON'T EDIT" banner
                    const banner = await habit.createLineItem(null, null, 'ascii-banner');
                    if (banner) {
                        banner.setSegments([{ type: 'text', text: "DON'T EDIT" }]);
                        banner.setMetaProperties({ banner_style: 'flames' });
                    }
                    // Then add heading and first entry after banner
                    await window.syncHub.insertMarkdown(`## Log\n${logEntry}`, habit, banner);
                } else {
                    await window.syncHub.insertMarkdown(logEntry, habit, logHeading);
                }

                // Find the newly created entry and set props on it
                const newLineItems = await habit.getLineItems();
                const newEntry = newLineItems.find(item => {
                    const text = item.segments?.map(s => s.text || '').join('') || '';
                    return text.startsWith(today) && !item.props?.habit_date;
                });
                if (newEntry) {
                    newEntry.setMetaProperties({ habit_date: today, habit_value: todayTotal });
                    console.log('[HabitHub] Added log with props:', logEntry);
                }
            }
        } catch (e) {
            console.error('[HabitHub] Error updating habit log:', e);
        }
    }

    /**
     * Build the summary text that replaces the original entry
     * Format: ✓ logged VALUE HABITNAME EMOJI REMAINING to go
     */
    buildSummaryText(habitName, emoji, value, unit, target, todayTotal, kind) {
        let summary = '✓ ';

        // Value part - show if we have a numeric value
        if (value && value > 1) {
            summary += `${value}${unit} ${habitName}`;
        } else {
            summary += `${habitName}`;
        }

        // Emoji
        summary += ` ${emoji}`;

        // Remaining part (only if there's a target)
        if (target > 0 && value) {
            const remaining = Math.max(0, target - todayTotal);
            if (remaining > 0) {
                if (kind === 'vice') {
                    summary += ` | ${remaining}${unit} left`;
                } else {
                    summary += ` | ${remaining}${unit} to go`;
                }
            } else {
                summary += ' | target hit!';
            }
        }

        return summary;
    }

    // =========================================================================
    // Journal Integration
    // =========================================================================

    /**
     * Log a habit directly to the habit log (skips journal for less noise)
     */
    async logHabit(habit, value = 1) {
        const name = habit.getName();
        const unit = habit.prop('unit')?.text() || '';

        try {
            // Write directly to habit log (source of truth)
            await this.appendToHabitLog(habit, value, unit);

            // Touch the record to trigger Thymer's refresh infrastructure
            habit.prop('updated_at')?.set(new Date());

            this.ui.addToaster({
                title: 'HabitHub',
                message: `Logged ${name}${value > 1 ? ` (+${value}${unit})` : ''}`,
                dismissible: true,
                autoDestroyTime: 2000,
            });
        } catch (e) {
            console.error('[HabitHub] Error logging habit:', e);
            this.ui.addToaster({
                title: 'HabitHub',
                message: 'Failed to log habit',
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }
    }

    async getTodayJournal() {
        try {
            const collections = await this.data.getAllCollections();
            const journalCollection = collections.find(c => c.getName() === 'Journal');
            if (!journalCollection) return null;

            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const records = await journalCollection.getAllRecords();
            return records.find(r => r.guid.endsWith(today)) || null;
        } catch (e) {
            return null;
        }
    }

    async insertIntoJournal(journal, markdown) {
        // Find or create Habits section, then insert entry
        // For now, just append to the end
        try {
            const existingItems = await journal.getLineItems();
            const topLevelItems = existingItems.filter(item => item.parent_guid === journal.guid);
            const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

            const newItem = await journal.createLineItem(null, lastItem, 'task');
            if (newItem) {
                // Parse the habit link from markdown
                const match = markdown.match(/\[\[([^\]]+)\]\]/);
                if (match) {
                    const segments = [
                        { type: 'ref', text: { guid: match[1] } }
                    ];
                    // Add value if present
                    const valueMatch = markdown.match(/\]\]\s*(.+)$/);
                    if (valueMatch) {
                        segments.push({ type: 'text', text: ` ${valueMatch[1]}` });
                    }
                    newItem.setSegments(segments);
                }
            }
        } catch (e) {
            console.error('[HabitHub] Error inserting into journal:', e);
        }
    }

    async getTodayLogs() {
        // TODO: Scan today's journal for habit entries
        // Returns array of { habitGuid, value, timestamp }
        return [];
    }

    // =========================================================================
    // Stats Calculation (from log entries - source of truth)
    // =========================================================================

    /**
     * Calculate habit stats from log entries in the habit page
     * Reads from props (habit_date, habit_value) - instant, no text parsing!
     */
    async getHabitStats(habit) {
        const lineItems = await habit.getLineItems();

        // Find log entries by props - instant lookup!
        const logs = [];
        for (const item of lineItems) {
            if (item.props?.habit_date) {
                logs.push({
                    date: item.props.habit_date,
                    value: item.props.habit_value || 1
                });
            }
        }

        // Sort by date descending (most recent first)
        logs.sort((a, b) => b.date.localeCompare(a.date));

        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        let total = 0;
        let weeklyTotal = 0;
        let todayTotal = 0;
        let streak = 0;
        let bestStreak = 0;
        let currentStreak = 0;
        let lastDate = null;

        for (const log of logs) {
            total += log.value;

            if (log.date >= weekAgo) {
                weeklyTotal += log.value;
            }

            if (log.date === today) {
                todayTotal += log.value;
            }

            // Streak calculation
            if (lastDate === null) {
                // First entry
                if (log.date === today || log.date === this.getYesterday()) {
                    currentStreak = 1;
                }
            } else {
                const expectedPrev = this.getPreviousDay(lastDate);
                if (log.date === expectedPrev) {
                    currentStreak++;
                } else {
                    // Streak broken, check if best
                    if (currentStreak > bestStreak) bestStreak = currentStreak;
                    currentStreak = 0;
                }
            }
            lastDate = log.date;
        }

        // Final streak check
        if (currentStreak > bestStreak) bestStreak = currentStreak;
        streak = currentStreak;

        return {
            total,
            weeklyTotal,
            todayTotal,
            streak,
            bestStreak,
            logCount: logs.length,
            logs // raw data for sparklines etc
        };
    }

    getYesterday() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    getPreviousDay(dateStr) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    /**
     * Get array of date strings for last N days (including today)
     * Returns oldest first
     */
    getWeekDays(days) {
        const result = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            result.push(d.toISOString().slice(0, 10));
        }
        return result;
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    getEmojiFromChoice(choiceId) {
        const emojiMap = {
            'running': '🏃', 'gym': '🏋️', 'reading': '📚', 'meditation': '🧘',
            'water': '💧', 'sleep': '😴', 'writing': '✍️', 'coding': '💻',
            'music': '🎵', 'language': '🗣️', 'cooking': '🍳', 'walking': '🚶',
            'cycling': '🚴', 'yoga': '🧘‍♀️', 'stretching': '🤸', 'journaling': '📔',
            'cleaning': '🧹', 'vitamins': '💊', 'flossing': '🦷', 'skincare': '🧴',
            'smoking': '🚬', 'alcohol': '🍺', 'coffee': '☕', 'sugar': '🍬',
            'screentime': '📱', 'socialmedia': '📲', 'fastfood': '🍔', 'snacking': '🍿',
            'custom': '⭐'
        };
        return emojiMap[choiceId] || '⭐';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    log(message, level = 'info') {
        const prefix = '[HabitHub]';
        if (level === 'error') {
            console.error(prefix, message);
        } else {
            console.log(prefix, message);
        }
    }
}
