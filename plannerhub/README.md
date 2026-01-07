# PlannerHub

Your companion for daily planning - plan your day with tasks from Issues.

## Overview

PlannerHub bridges the gap between your Issues backlog and your daily work. It provides:

- **Planner View**: Kanban-style board showing Today's tasks, Doing issues, and Next issues
- **Quick Add**: Click any issue to add "work on [[issue]]" to your daily note
- **MCP Tools**: Let AI assistants help you plan and track work

## Features

### Planner View

```
┌──────────────────┬──────────────────┬──────────────────┐
│ ✓ Today (3)      │ ⟳ Doing (2)      │ → Next (4)       │
├──────────────────┼──────────────────┼──────────────────┤
│ ☐ work on        │ Calendar sync    │ Review PR #42    │
│   [[Auth bug]]   │ thymer-synchub   │                  │
│                  │ #18              │ Update docs      │
│ ☑ standup        │                  │                  │
│                  │ OAuth refresh    │ Performance      │
│ ☐ review PR      │ thymer-app #142  │ audit            │
└──────────────────┴──────────────────┴──────────────────┘
```

### Quick Actions

- **Click issue** → Adds "work on [[issue]]" to today's journal
- **Click checkbox** → Toggle task completion
- **Refresh** → Reload tasks and issues

## MCP Tools

When SyncHub is installed, these tools are available to AI assistants:

| Tool | Description |
|------|-------------|
| `planner_today` | Get today's tasks from the daily note |
| `planner_whats_next` | Get the next uncompleted task |
| `planner_add` | Add a task to today's note |
| `planner_issues_doing` | Get issues in "In Progress" status |
| `planner_issues_next` | Get issues in "Next" status |

### Example: "What should I work on?"

```javascript
// AI assistant can call:
const next = await window.plannerHub.getWhatsNext();
// Returns: { text: "work on [[Auth bug]]", done: false, issueTitle: "Auth bug fix" }
```

## API

PlannerHub exposes `window.plannerHub`:

```javascript
// Get today's tasks
const tasks = await window.plannerHub.getTodayTasks();

// Get issues by status
const doing = await window.plannerHub.getIssues('In Progress');
const next = await window.plannerHub.getIssues('Next');

// Add task to today
await window.plannerHub.addToToday('review PR #42');
await window.plannerHub.addToToday(null, issueGuid); // Links to issue

// Get next task
const nextTask = await window.plannerHub.getWhatsNext();
```

## Data Flow

```
Issues Collection              Journal (Today)
──────────────────             ──────────────────
│ Auth bug        │            - work on [[Auth bug]]
│ status: Doing   │   ──▶      - review PR
│ Ship X          │            - standup ✓
│ status: Next    │
```

Issues stay in their collection. Tasks in your journal link to issues via `[[guid]]` references.

## Requirements

- SyncHub plugin (for MCP tools)
- Issues collection (for issue integration)
- Journal collection (for daily tasks)

## Installation

1. Install SyncHub if not already installed
2. Install PlannerHub collection + plugin
3. Open PlannerHub → Planner view

## Roadmap

- **Phase 2**: Timer tracking, status bar companion
- **Phase 3**: Daily review, time insights
- **Phase 4**: Dashboard with weekly/monthly views
