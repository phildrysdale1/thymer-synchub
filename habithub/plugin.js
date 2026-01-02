/**
 * HabitHub - Track habits and break vices
 *
 * Journal is the source of truth. Habits are logged with:
 *   - [x] [[HabitName]] 30m
 *   - [x] [[HabitName]] 5
 *   - [x] [[HabitName]]
 *
 * HabitHub scans journals and aggregates stats.
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
    .habit-card[data-kind="vice"] {
        background: linear-gradient(135deg, var(--bg-hover) 0%, rgba(218, 54, 51, 0.05) 100%);
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
    .habit-card[data-kind="vice"] .habit-card-value {
        color: var(--enum-blue-fg);
    }
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
    .habit-card[data-kind="vice"] .habit-sparkline-bar {
        background: rgba(248, 81, 73, 0.3);
    }
    .habit-sparkline-bar.today {
        background: var(--enum-green-fg);
    }
    .habit-card[data-kind="vice"] .habit-sparkline-bar.today {
        background: var(--enum-orange-fg);
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

                // Quick log buttons
                const quickLog = document.createElement('div');
                quickLog.className = 'habit-quick-log';
                for (const habit of habits) {
                    const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());
                    const name = habit.getName() || 'Habit';
                    const btn = document.createElement('button');
                    btn.className = 'habit-quick-log-btn';
                    btn.innerHTML = `<span class="emoji">${emoji}</span> ${this.escapeHtml(name)}`;
                    btn.addEventListener('click', () => this.logHabit(habit));
                    quickLog.appendChild(btn);
                }
                container.appendChild(quickLog);

                // Today section
                const todaySection = document.createElement('div');
                todaySection.className = 'habit-today';

                const todayLogs = await this.getTodayLogs();
                const completedToday = habits.filter(h =>
                    todayLogs.some(log => log.habitGuid === h.guid)
                ).length;

                todaySection.innerHTML = `
                    <div class="habit-today-header">
                        <div class="habit-today-title">Today's Habits</div>
                        <div class="habit-today-progress">${completedToday}/${habits.length} complete</div>
                    </div>
                    <div class="habit-today-list">
                        ${habits.map(habit => {
                            const log = todayLogs.find(l => l.habitGuid === habit.guid);
                            const done = !!log;
                            const kind = habit.prop('kind')?.choice() || 'habit';
                            const target = habit.prop('target')?.number();
                            const unit = habit.prop('unit')?.text() || '';
                            const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());

                            return `
                                <div class="habit-today-item" data-done="${done}" data-kind="${kind}">
                                    <div class="habit-today-checkbox">${done ? '✓' : ''}</div>
                                    <span class="emoji">${emoji}</span>
                                    <div class="habit-today-name">${this.escapeHtml(habit.getName() || 'Habit')}</div>
                                    <div class="habit-today-target">${target ? `Target: ${target}${unit}` : ''}</div>
                                    <div class="habit-today-value">${log?.value || '—'}</div>
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

                // Habit cards grid + collect stats
                const grid = document.createElement('div');
                grid.className = 'habit-grid';

                let totalBestStreak = 0;
                let habitsCompletedToday = 0;

                for (const habit of habits) {
                    const card = await this.renderHabitCard(habit, viewContext);
                    grid.appendChild(card);

                    // Collect stats for summary
                    const stats = await this.getHabitStats(habit);
                    if (stats.bestStreak > totalBestStreak) totalBestStreak = stats.bestStreak;
                    if (stats.todayTotal > 0) habitsCompletedToday++;
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
                        <span class="habit-summary-value">${habitsCompletedToday}/${habits.length}</span>
                        <span>today</span>
                    </div>
                    <div class="habit-summary-item">
                        <span class="habit-summary-value">${totalBestStreak}</span>
                        <span>best streak</span>
                    </div>
                `;
                container.appendChild(summary);
            };

            return {
                onLoad: async () => {
                    viewContext.makeWideLayout();
                    element.style.overflow = 'auto';
                    container = document.createElement('div');
                    container.className = 'habit-dashboard';
                    element.appendChild(container);

                    // Trigger journal scan when dashboard opens
                    await this.scanJournalForHabits();
                },
                onRefresh: async ({ records: newRecords }) => {
                    records = newRecords;
                    await renderDashboard();
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

    async renderHabitCard(habit, viewContext) {
        const name = habit.getName() || 'Habit';
        const kind = habit.prop('kind')?.choice() || 'habit';
        const emoji = this.getEmojiFromChoice(habit.prop('emoji')?.choice());
        const schedule = habit.prop('schedule')?.choice() || 'daily';
        const target = habit.prop('target')?.number() || 0;
        const unit = habit.prop('unit')?.text() || '';

        // Get stats from log entries (source of truth)
        const stats = await this.getHabitStats(habit);
        const { weeklyTotal, streak, logs } = stats;

        const card = document.createElement('div');
        card.className = 'habit-card';
        card.setAttribute('data-kind', kind);

        // Determine streak badge style
        let streakClass = 'dormant';
        let streakIcon = '💤';
        if (streak > 0) {
            if (kind === 'vice') {
                streakClass = 'ice';
                streakIcon = '🧊';
            } else {
                streakClass = 'fire';
                streakIcon = '🔥';
            }
        }

        // Format value display
        let valueDisplay = weeklyTotal.toString();
        let unitDisplay = 'this week';
        if (kind === 'vice' && streak > 0) {
            valueDisplay = `${streak}d`;
            unitDisplay = 'under target';
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
                ${this.renderSparkline(7, sparklineData)}
            </div>
            <div class="habit-card-footer">
                <span>${target ? `◎ ${weeklyTotal}/${target * 7}${unit}` : ''}</span>
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

    renderSparkline(days, data = null) {
        // If no data, show empty bars
        if (!data || data.length === 0 || data.every(v => v === 0)) {
            let html = '';
            for (let i = 0; i < days; i++) {
                const isToday = i === days - 1;
                html += `<div class="habit-sparkline-bar${isToday ? ' today' : ''}" style="height: 3px"></div>`;
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
            html += `<div class="habit-sparkline-bar${isToday ? ' today' : ''}" style="height: ${height}%"></div>`;
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

            // Find Log heading and today's entry
            let logHeading = null;
            let todayEntry = null;

            for (const item of lineItems) {
                const text = item.segments?.map(s => s.text || '').join('') || '';
                if (item.type === 'heading' && text === 'Log') {
                    logHeading = item;
                }
                if (text.startsWith(today)) {
                    todayEntry = item;
                }
            }

            // Calculate new total for today
            let todayTotal = value || 1;
            if (todayEntry) {
                const existingText = todayEntry.segments?.map(s => s.text || '').join('') || '';
                const match = existingText.match(/- (\d+(?:\.\d+)?)/);
                if (match) {
                    todayTotal = parseFloat(match[1]) + (value || 1);
                }
            }

            // Build entry text
            const logEntry = todayTotal > 1 ? `${today} - ${todayTotal}${unit}` : `${today}`;

            if (todayEntry) {
                // Update existing entry
                todayEntry.setSegments([{ type: 'text', text: logEntry }]);
                console.log('[HabitHub] Updated log:', logEntry);
            } else if (window.syncHub?.insertMarkdown) {
                // Create new entry
                if (!logHeading) {
                    // No log section yet - create at top of page
                    await window.syncHub.insertMarkdown(`## Log\n${logEntry}`, habit, null);
                } else {
                    await window.syncHub.insertMarkdown(logEntry, habit, logHeading);
                }
                console.log('[HabitHub] Added log:', logEntry);
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
     * Log a habit to today's journal
     */
    async logHabit(habit, value = null) {
        const journal = await this.getTodayJournal();
        if (!journal) {
            this.ui.addToaster({
                title: 'HabitHub',
                message: 'Could not find today\'s journal',
                dismissible: true,
                autoDestroyTime: 3000,
            });
            return;
        }

        const name = habit.getName();
        const valueType = habit.prop('value_type')?.choice() || 'boolean';
        const unit = habit.prop('unit')?.text() || '';

        // Build the journal entry
        let entry = `- [x] [[${habit.guid}]]`;
        if (value && valueType !== 'boolean') {
            entry += ` ${value}${unit}`;
        }

        // Insert into journal
        await this.insertIntoJournal(journal, entry);

        this.ui.addToaster({
            title: 'HabitHub',
            message: `Logged ${name}${value ? ` (${value}${unit})` : ''}`,
            dismissible: true,
            autoDestroyTime: 2000,
        });
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
     * Log format: "2026-01-02 - 40" or "2026-01-02" (boolean)
     */
    async getHabitStats(habit) {
        const lineItems = await habit.getLineItems();

        // Find log entries (lines starting with date pattern)
        const logs = [];
        for (const item of lineItems) {
            const text = item.segments?.[0]?.text || '';
            const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s*-\s*(\d+))?/);
            if (match) {
                logs.push({
                    date: match[1],
                    value: match[2] ? parseInt(match[2]) : 1
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
