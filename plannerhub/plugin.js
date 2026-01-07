const VERSION = 'v1.0.15';
/**
 * PlannerHub - Your companion for daily planning
 *
 * Phase 1+: Planning MVP
 * - Kanban view: Today's Plan | Doing | Next | Daily Note
 * - Today's Plan: tasks for today (from PlannerHub section)
 * - Doing/Next: issues by status (click to add "work on [[issue]]")
 * - Daily Note: browse any day's tasks, transclude to today's plan
 * - MCP tools for AI assistants
 */

const PLANNERHUB_HEADING = 'PlannerHub';

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

            // Get today's tasks from Journal
            getTodayTasks: () => this.getTodayTasks(),

            // Get issues by status
            getIssues: (status) => this.getIssuesByStatus(status),

            // Add task to today's daily note (under PlannerHub section)
            addToToday: (text, issueGuid) => this.addToToday(text, issueGuid),

            // Get what's next (first unchecked task)
            getWhatsNext: () => this.getWhatsNext(),

            // Get the current month record
            getCurrentMonth: () => this.getOrCreateCurrentMonth(),

            // Get incomplete tasks from previous days
            getIncompleteTasks: (daysBack) => this.getIncompleteTasks(daysBack),

            // Migrate a task from a previous day to today
            migrateTask: (taskGuid, sourceJournal) => this.migrateTask(taskGuid, sourceJournal),

            // Remove a task from today (for an issue)
            unplanTask: (issueGuid) => this.unplanTask(issueGuid),
        };

        console.log('[PlannerHub] API exposed at window.plannerHub');
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

                // Check completion status
                const doneStatus = item.props?.done;
                const isDone = doneStatus && doneStatus !== 0;

                tasks.push({
                    guid: item.guid,
                    text: trimmedText,
                    done: isDone,
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

                // Check done status from the actual item
                const doneStatus = actualItem.props?.done;
                const isDone = doneStatus && doneStatus !== 0;

                tasks.push({
                    guid: item.guid,  // Use the ref's guid for UI operations
                    actualGuid: taskGuid,  // The real task guid
                    text: trimmedText,
                    done: isDone,
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

                tasks.push({
                    guid: item.guid,
                    text: trimmedText,
                    done: !!item.props?.done,
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
        const incompleteTasks = tasks.filter(t => !t.done);

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
        const nextTask = tasks.find(t => !t.done);

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
                            <span class="planner-stat-value">${dailyNoteTasks.filter(t => !t.done).length}</span>
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
        const addableTasks = tasks.filter(t => !t.done && !plannedGuids.has(t.guid));

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

        const cardClass = `planner-card daily-note-task ${task.done ? 'done' : ''} ${isInPlan ? 'in-plan' : ''}`;
        const showAddButton = !task.done && !isInPlan;

        return `
            <div class="${cardClass}" data-guid="${task.guid}" data-type="daily-note-task">
                <div class="planner-card-header">
                    <div class="planner-card-checkbox" ${task.done ? 'style="pointer-events:none"' : ''}></div>
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

        return `
            <div class="planner-card task ${task.done ? 'done' : ''}" data-guid="${task.guid}" data-type="task" data-index="${index}">
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
