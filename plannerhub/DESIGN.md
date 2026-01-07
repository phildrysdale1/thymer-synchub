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

## Phase 2 (Future)

### Backlog Section

Horizontal area under the kanban for parking issues:
- Filter text field to search
- Drag to Next to prioritize
- Less prominent than kanban columns

### Time Tracking

Timer integration:
- Start/stop timer on active task
- Time logged as child items under tasks
- Status bar overlay showing current task
