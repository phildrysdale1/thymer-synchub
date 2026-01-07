# PlannerHub Design

Implementation notes and architectural decisions for PlannerHub.

## Phase 1+ (Current)

Four-column planning Kanban:

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ ✓ Today's   │ ⟳ Doing     │ → Next      │ 📓 Daily    │
│   Plan      │             │             │   Note      │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Tasks for   │ In Progress │ Next issues │ ◀ ▶ Jan 7   │
│ today       │ issues      │             │             │
│             │             │             │ ☐ task from │
│ (transclu-  │ [+ add]     │ [+ add]     │   any day   │
│ sions +     │             │             │ [+ add]     │
│ refs)       │             │             │ [Add all]   │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Today's Plan Column

Shows tasks under `## PlannerHub` section in today's journal:
- **Issue refs**: "work on [[issue]]" - created when clicking + on issues
- **Transclusions**: Tasks from any day added via Daily Note column
- Deduped by GUID (transclusions appear once)

### Doing / Next Columns

Issues from the Issues collection:
- Filtered by status ("In Progress" / "Next")
- Click + to add "work on [[issue]]" to today
- Click x to unplan (removes from today)
- Already-planned issues shown faded at bottom

### Daily Note Column

Browse tasks from any day's journal:
- Day navigation arrows (◀ ▶) to browse history
- Starts at Today, can go back indefinitely
- **Add to Plan**: Transclude individual task to today
- **Add all**: Transclude all incomplete tasks

### Data Model

Two ways tasks appear in Today's Plan:

1. **Issue refs** (for issues):
   ```javascript
   // type: 'task' with ref segment
   segments: [
     { type: 'text', text: 'work on ' },
     { type: 'ref', text: { guid: 'issue-guid' } }
   ]
   ```

2. **Transclusions** (for daily note tasks):
   ```javascript
   // type: 'ref' with itemref property
   props: { itemref: 'original-task-guid' }
   ```

## PlannerHub Section in Daily Note

PlannerHub owns a `## PlannerHub` heading in the daily note:

```
Journal - Wed Jan 7
├── User's manual tasks...
│
└── ## PlannerHub
    ├── work on [[Agent Router]]         ← issue ref
    ├── ☐ finish the report              ← transclusion from yesterday
    └── work on [[Epic: Full UI]]        ← issue ref
```

- Created automatically when first task is added
- Only PlannerHub manages items under this heading
- Keeps user's manual tasks separate from planned work

## Rendering Strategy

### Surgical Updates (Fast)

Most operations update items directly by GUID:

| Action | Strategy |
|--------|----------|
| Add task | `createLineItem` after last in section |
| Mark done | Find by GUID, `setMetaProperties({ done: 8 })` |
| Toggle status | Find by GUID, update props |

### Full Rerender (When Needed)

| Action | Strategy |
|--------|----------|
| Remove from plan | Clear segments (SDK can't delete) |
| Reorder tasks | Future: rerender entire section |

**Key limitation:** SDK can't delete items, only empty them.

## Task Status Reference

Task status is stored in `props.done`:

| Value | Status | Icon |
|-------|--------|------|
| `undefined` | Todo (unchecked) | - |
| `0` | Unchecked (explicit) | - |
| `1` | In Progress | `ti-player-play` |
| `2` | Blocked / Waiting | `ti-player-pause` |
| `3` | Cost related | `ti-currency-dollar` |
| `4` | Important | `ti-alert-square` |
| `5` | Discuss / Question | `ti-help` |
| `6` | Alert | `ti-alert-triangle` |
| `7` | Starred | `ti-star` |
| `8` | Done (completed) | `ti-check` |

## UI Components

### Inline Command Palette

Thymer's dropdown component for quick actions (status changes, task picker):

```html
<div class="cmdpal--inline animate-open active focused-component"
     style="position: fixed; width: 220px; z-index: 9999;">
    <div class="autocomplete clickable">
        <div class="autocomplete--option autocomplete--option-selected">
            <span class="autocomplete--option-icon"><span class="ti ti-check"></span></span>
            <span class="autocomplete--option-label">Done</span>
        </div>
        <!-- more options -->
    </div>
</div>
```

Use for:
- Quick status changes on tasks
- Task picker when clicking +
- Issue selector dropdown

## API

### window.plannerHub

```javascript
window.plannerHub = {
    version: 'v1.0.x',

    // Read
    getTodayTasks: () => [...],
    getIssues: (status) => [...],
    getWhatsNext: () => {...},
    getIncompleteTasks: (daysBack) => [...],

    // Write
    addToToday: (text, issueGuid) => boolean,
    migrateTask: (taskGuid, sourceJournal) => boolean,
    unplanTask: (issueGuid) => boolean,
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `planner_today` | Get today's tasks |
| `planner_whats_next` | Get next uncompleted task |
| `planner_add` | Add task to today |
| `planner_issues_doing` | Get In Progress issues |
| `planner_issues_next` | Get Next issues |

## Phase 2: Time Scheduling

### Architecture Overview

PlannerHub provides the **planning layer**. A separate **Session plugin** (AppPlugin) provides the **focus layer** - the companion overlay that follows you.

```
┌────────────────────────────────────────────────────────────┐
│                    Session Plugin                          │
│                    (AppPlugin - the companion)             │
├────────────────────────────────────────────────────────────┤
│  Consumes from:                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Calendar │  │  Issues  │  │ Planner  │  │ Journal  │   │
│  │    ?     │  │    ?     │  │   Hub    │  │  (core)  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       ▼             ▼             ▼             ▼          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Unified Timeline View                   │  │
│  │  • Scheduled tasks (explicit time)                  │  │
│  │  • Auto-placed tasks (gap-filled)                   │  │
│  │  • Calendar events (merged in)                      │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                                │
│           ┌───────────────┼───────────────┐               │
│           ▼               ▼               ▼               │
│      [Status Bar]    [Compact]       [Full Mode]          │
│       ▶ Task 23:45   Floating card   Timer + Timeline     │
└────────────────────────────────────────────────────────────┘
```

### Time Slots as Child Items

Time is stored as **child text items** under tasks (native Thymer pattern):

```
Journal - Wed Jan 7
└── ## PlannerHub
    ├── ☐ Auth bug fix                              ← task
    │   └── Wed Jan 7 10:00 — Wed Jan 7 11:30      ← time child
    ├── ☐ Review PR #42                             ← task (unscheduled)
    └── ☐ Update docs                               ← task (unscheduled)
```

**Data structure:**
```javascript
// Task item
{
    type: 'task',
    guid: 'task-guid',
    parent_guid: 'heading-guid',  // PlannerHub heading
    segments: [{ type: 'text', text: 'Auth bug fix' }],
    props: { done: 0 }
}

// Time child item
{
    type: 'text',
    guid: 'time-guid',
    parent_guid: 'task-guid',     // Parent is the task
    segments: [{ type: 'text', text: 'Wed Jan 7 10:00 — Wed Jan 7 11:30' }]
}
```

**Benefits:**
- Uses native Thymer patterns
- Time is visible in the document
- Works with existing item manipulation SDK

### Auto-Fill Algorithm

Unscheduled tasks automatically fill gaps in the timeline (default 1hr blocks):

```
Input:
  Scheduled:    09:00-10:00 Standup
                14:00-15:00 Meeting (calendar)
  Unscheduled:  Auth bug, Review PR, Update docs

Output (Timeline View):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
09:00 ┃ Standup              ┃ scheduled
10:00 ┃ Auth bug             ┃ auto (1hr)
11:00 ┃ Review PR            ┃ auto (1hr)
12:00 ┃ Update docs          ┃ auto (1hr)
13:00 ┃ ░░░░░░░░░░░░░░░░░░░░ ┃ gap
14:00 ┃ Meeting              ┃ calendar
15:00 ┃                      ┃
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Algorithm:**
1. Get scheduled tasks (have time child) → sort by start time
2. Get calendar events from Calendar collection (if installed)
3. Merge into blocked time slots
4. Get unscheduled tasks (no time child) → preserve list order
5. Find gaps between blocked slots
6. Place unscheduled tasks into gaps (1hr default)
7. Return unified timeline

### Task Status

Tasks have a semantic `status` field instead of boolean `done`:

| Status | Raw Value | Icon | Description |
|--------|-----------|------|-------------|
| `'todo'` | `undefined`, `0`, `2-7` | ○ | Not started |
| `'in_progress'` | `1` | ▶ | Currently working |
| `'done'` | `8` | ✓ | Completed |

Task objects include both:
- `status`: Semantic status (`'todo'` | `'in_progress'` | `'done'`)
- `rawStatus`: Original numeric value for advanced use

### API (Extended)

```javascript
window.plannerHub = {
    version: 'v1.1.x',

    // ─────────────────────────────────────────────────────
    // Read - Tasks
    // ─────────────────────────────────────────────────────
    getTodayTasks: () => [...],
    getIssues: (status) => [...],
    getWhatsNext: () => {...},
    getIncompleteTasks: (daysBack) => [...],

    // ─────────────────────────────────────────────────────
    // Read - Timeline (Phase 2)
    // ─────────────────────────────────────────────────────
    getTimelineView: (opts?) => [
        // Unified view with auto-fill
        { guid, text, start, end, type: 'scheduled' },
        { guid, text, start, end, type: 'auto' },
        { guid, text, start, end, type: 'calendar' },
    ],
    getScheduledTasks: () => [...],    // Only explicit times
    getUnscheduledTasks: () => [...],  // No time child
    getTaskSchedule: (taskGuid) => { start, end } | null,

    // ─────────────────────────────────────────────────────
    // Write - Tasks
    // ─────────────────────────────────────────────────────
    addToToday: (text, issueGuid?) => boolean,
    migrateTask: (taskGuid, sourceJournal) => boolean,
    unplanTask: (issueGuid) => boolean,

    // ─────────────────────────────────────────────────────
    // Write - Status (Phase 2)
    // ─────────────────────────────────────────────────────
    setTaskStatus: (taskGuid, status) => boolean,
    // Convenience:
    markDone: (taskGuid) => boolean,        // status = 8
    markInProgress: (taskGuid) => boolean,  // status = 1

    // ─────────────────────────────────────────────────────
    // Write - Scheduling (Phase 2)
    // ─────────────────────────────────────────────────────
    scheduleTask: (taskGuid, start, end?) => boolean,
    // Creates/updates time child, reorders task by start time
    // end defaults to start + 1hr

    unscheduleTask: (taskGuid) => boolean,
    // Clears time child, task returns to auto-fill pool

    // ─────────────────────────────────────────────────────
    // Write - Reorder (Phase 2)
    // ─────────────────────────────────────────────────────
    moveTaskAfter: (taskGuid, afterGuid) => boolean,
    // Manual reorder for unscheduled tasks
}
```

### Timeline View Options

```javascript
getTimelineView({
    workdayStart: '09:00',      // Default start
    workdayEnd: '18:00',        // Default end
    defaultDuration: 60,        // Minutes for auto-placed
    includeCalendar: true,      // Merge calendar events
    includeCompleted: false,    // Hide done tasks
})
```

### Session Plugin Integration

The Session plugin consumes PlannerHub's API:

```javascript
// Session plugin startup
async function init() {
    // Detect available collections
    this.hasCalendar = !!window.calendarHub;
    this.hasIssues = !!window.issuesHub;
    this.hasPlannerHub = !!window.plannerHub;

    // Get unified timeline
    if (this.hasPlannerHub) {
        const timeline = await window.plannerHub.getTimelineView({
            includeCalendar: this.hasCalendar
        });
        this.renderTimeline(timeline);
    }
}

// Start focus session
async function startSession(taskGuid) {
    await window.plannerHub.markInProgress(taskGuid);
    this.activeTask = taskGuid;
    this.startTimer();
}

// Complete session
async function endSession() {
    await window.plannerHub.markDone(this.activeTask);
    this.stopTimer();
    this.logSession();  // Write to Journal
}
```

### Collection APIs Needed

For full integration, other collections should expose:

| Collection | API | Purpose |
|------------|-----|---------|
| Calendar | `window.calendarHub.getTodayEvents()` | Merge into timeline |
| Calendar | `window.calendarHub.getNextEvent()` | Status bar display |
| Issues | `window.issuesHub.getByStatus(status)` | Doing/Next counts |

### Console Test Suite

PlannerHub exposes a test suite at `window.plannerHubTests`:

```javascript
// Run all tests
await window.plannerHubTests.runAll()

// Individual tests
await window.plannerHubTests.testGetTasks()
await window.plannerHubTests.testStatusManipulation()
await window.plannerHubTests.testScheduling()
await window.plannerHubTests.testTimelineView()

// Interactive helpers
await window.plannerHubTests.listTasks()           // Show tasks with GUIDs
await window.plannerHubTests.showTimeline()        // Display timeline
await window.plannerHubTests.addTestTask('text')   // Add a test task
await window.plannerHubTests.scheduleFirstTask('10:00')  // Schedule first task
```

**Implementation notes:**
- Tests are idempotent (can run multiple times safely)
- `scheduleTask()` reuses existing text children to prevent empty line accumulation
- Tests restore original state after modification

## Phase 3 (Future)

### Backlog Section

Horizontal area under the kanban for parking issues:
- Filter text field to search
- Drag to Next to prioritize
- Less prominent than kanban columns

### Focus Sessions Collection

Track completed focus sessions:

```json
{
  "name": "Sessions",
  "fields": [
    { "id": "task", "type": "text" },
    { "id": "linked_issue", "type": "record" },
    { "id": "started_at", "type": "datetime" },
    { "id": "ended_at", "type": "datetime" },
    { "id": "duration", "type": "number" },
    { "id": "status", "type": "choice" }
  ]
}
```

### Horizons (Long-term)

Planning dimension orthogonal to status:

| Horizon | Scale | Nature |
|---------|-------|--------|
| Day | hours | atomic, concrete |
| Week | days | chunked, tangible |
| Month | weeks | project-sized |
| Quarter | months | strategic goal |
| Year | quarters | milestone |
