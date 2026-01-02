# HabitHub Spec

## Overview

HabitHub is a habit tracking system built on Thymer's native primitives. Each habit is a page in the HabitHub collection. Tracking happens in the daily journal using checkbox + link syntax. HabitHub aggregates data and visualizes progress.

**Philosophy**: Journal is source of truth, HabitHub aggregates and visualizes.

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  JOURNAL (user writes, HabitHub reads)                      │
│                                                             │
│  ## Habits                          ← auto-created summary  │
│  🏃 Exercise 😊 45m | 📚 Read 😐 20m  ← column layout       │
│                                                             │
│  ## Morning                                                 │
│  - [x] [[Exercise]] 30m             ← user checks when done │
│  - [x] [[Exercise]] 15m             ← multiple sessions OK  │
│  - [ ] [[Meditation]]               ← unchecked = ignored   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    ↓ scan checked items, aggregate
┌─────────────────────────────────────────────────────────────┐
│  HABIT PAGE (Exercise)                                      │
│                                                             │
│  ## Log                             ← reverse chronological │
│  2025-01-02 - 45m ✓                 ← daily total          │
│  2025-01-01 - 30m ✓                                        │
│  2024-12-31 - 60m ✓                                        │
│                                                             │
│  [Properties: streak, total, etc.]                          │
└─────────────────────────────────────────────────────────────┘
```

**Key principle**: User controls the checkbox. `[ ]` = planned/ignored, `[x]` = done/imported.

## Journal Syntax

Native Thymer primitives:
```markdown
## Habits
- [x] [[Exercise]] 30m      ← checked = import this
- [x] [[Read]] 45m "Atomic Habits"
- [ ] [[Meditation]]        ← unchecked = skip (user hasn't done it yet)
- [x] [[Smoking]] 5
```

- `- [ ]` - Planned/intended, HabitHub ignores
- `- [x]` - Completed, HabitHub imports
- `[[HabitName]]` - Link to habit page (bidirectional)
- Value after link: duration (`30m`), count (`5`), or nothing (boolean)
- Optional `## Habits` section for organization

## Journal Summary Section

If habit has "Show in Journal" enabled, HabitHub creates/updates a summary at the top:

```markdown
## Habits
🏃 Exercise 😊 45m | 📚 Read 😐 20m | 🧘 Meditation ⬜ —
```

- Uses Thymer columns for compact display
- Rating emoji based on target: 😊 ≥100%, 😐 50-99%, 😞 <50%, ⬜ not logged
- Updates as user checks off habits throughout the day

## Habit Types

### By Value Type
| Type | Example | Journal Syntax |
|------|---------|----------------|
| `boolean` | Woke early, Made bed | `- [x] [[Woke Early]]` |
| `duration` | Exercise, Reading | `- [x] [[Exercise]] 30m` |
| `count` | Pushups, Cigarettes | `- [x] [[Smoking]] 5` |

### By Kind
| Kind | Behavior | Streak Logic |
|------|----------|--------------|
| `habit` | More is better | Streak = consecutive days meeting target |
| `vice` | Less is better | Streak = consecutive days under target |

## Collection Schema

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Habit name (e.g., "Exercise") |
| `command` | text | Trigger word for matching (e.g., "exercise", "gym") |
| `kind` | choice | `habit` / `vice` |
| `value_type` | choice | `boolean` / `duration` / `count` |
| `schedule` | choice | `daily` / `weekdays` / `weekends` / `weekly` |
| `weekly_target` | number | Times per week (for `weekly` schedule) |
| `target` | number | Daily target value (30m, ≤5, etc.) |
| `goal_value` | number | Long-term goal (100km, 12 books) |
| `goal_date` | datetime | Goal deadline |
| `unit` | text | Display unit (m, km, books, cigarettes) |
| `streak` | number | Current streak (read-only) |
| `best_streak` | number | All-time best streak (read-only) |
| `total` | number | All-time total (read-only) |
| `last_completed` | datetime | Last completion (read-only) |

### Views

1. **Dashboard** (custom) - Visual overview with cards/heatmaps
2. **All Habits** (table) - Full list with stats
3. **By Kind** (board) - Grouped into habits vs vices

## Auto-Population

When daily journal is created, HabitHub inserts scheduled habits:

```markdown
## Habits
- [ ] [[Exercise]] /30m
- [ ] [[Read]] /30m
- [ ] [[Meditation]]
```

- `/30m` shows target as hint (user fills in actual value)
- Only shows habits scheduled for today
- `3x/week` habits hide once target met for the week

## Command Palette (Ctrl+K)

### Master Command
- **"Log Habits"** - Opens quick-log popup

### Per-Habit Commands
Each habit auto-registers:
- **"Log Exercise"**
- **"Log Reading"**
- **"Log Smoking"**

### Quick-Log Popup

```
┌─────────────────────────────────┐
│ Log Habits             Thu Jan 2│
├─────────────────────────────────┤
│ [x] Exercise     [30] m    🔥 9 │
│ [ ] Read         [  ] m    🔥 3 │
│ [x] Meditation   ────────  🔥 4 │
│ [ ] Smoking      [ 5]      🟢12 │
├─────────────────────────────────┤
│              [Esc] [⏎ Save]     │
└─────────────────────────────────┘
```

- `Tab` - cycle habits
- `Space` - toggle boolean
- Type - enter value
- `Enter` - save all

### Dual-Write on Command Entry

When logging via command:
1. Insert `- [x] [[Habit]] value` into today's journal
2. Update habit record stats immediately
3. Append to habit page log

## Dashboard Design

### Habit Cards

Each habit gets a singlestat-style card:

```
┌─────────────────────────────┐
│  🏃 Exercise          🔥 9  │
│                             │
│        120m                 │
│      this week              │
│                             │
│    ▁▂▃▅▇▅▃▂▁   target: 30m │
└─────────────────────────────┘
```

- Icon + name + streak badge
- Big number: weekly/monthly total
- Sparkline: recent activity
- Target reminder

### Vice Cards (inverted)

```
┌─────────────────────────────┐
│  🚬 Smoking          🟢 12  │
│                             │
│      12 days                │
│     smoke-free              │
│                             │
│    ▇▅▃▂▁▁▁▁▁   target: ≤5  │
└─────────────────────────────┘
```

- Green badge = days clean (for quit goals)
- Downward sparkline = good
- "Days since" for abstinence goals

### Goal Progress

```
┌─────────────────────────────────────────┐
│  📚 Reading Goal                        │
│  ████████░░░░░░░░░░░░  2/12 books      │
│  17% complete • 11 months remaining     │
└─────────────────────────────────────────┘
```

### Heatmap (GitHub-style)

```
         Jan                    Feb
    M ░░▓▓░░▓▓▓▓░░▓▓▓▓░░░░▓▓▓▓░░▓▓
    T ▓▓▓▓░░▓▓▓▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓▓▓▓
    W ░░▓▓▓▓▓▓░░▓▓▓▓▓▓░░▓▓▓▓░░▓▓▓▓
    ...
```

- Green intensity = value (duration/count)
- Red for vices (inverted - darker = worse)
- Click day → jump to that journal entry

## Agent Integration

### Registered Tools

```javascript
registerCollectionTools({
    collection: 'HabitHub',
    tools: [
        {
            name: 'log_habit',
            description: 'Log a habit completion',
            parameters: { habit: string, value?: number }
        },
        {
            name: 'get_habit_stats',
            description: 'Get current stats for a habit',
            parameters: { habit: string },
            returns: { streak, total, trend, weekly, goal_progress }
        },
        {
            name: 'get_today_habits',
            description: 'Get all habits scheduled for today with completion status',
            returns: [{ name, completed, value, target, streak }]
        },
        {
            name: 'get_habit_trends',
            description: 'Get trend data for summaries',
            parameters: { period: 'week' | 'month' },
            returns: [{ habit, values, average, vs_last_period }]
        }
    ]
});
```

### Agent Use Cases

**Daily Summary Agent (evening):**
> "You hit 3/4 habits today. Exercise streak is now 9 days 🔥
> Smoking was 8, above your ≤5 target.
> Reading goal: 2/12 books, on track."

**Weekly Review Agent:**
> "Exercise: 5/5 days ✓ (+2 vs last week)
> Smoking trend: ↓ 42→35 weekly, nice progress
> Suggest: move gym to mornings based on your completions?"

**Conversational Logging:**
```
User: "did 15 mins meditation"
Agent: → calls log_habit("meditation", 15)
       "Logged! Meditation streak is now 4 days."
```

## Sync Strategy

| Trigger | Action |
|---------|--------|
| Command entry | Instant dual-write (journal + stats) |
| Dashboard open | Reconcile from journals (catch manual edits) |
| Background (optional) | Periodic scan for consistency |

## Open Questions

1. **Habit templates?** - Pre-built habits (Exercise, Sleep, Water) with sensible defaults
2. **Reminders/notifications?** - Push reminders at specific times
3. **Social/accountability?** - Share streaks or compete with friends
4. **Import from other apps?** - Streaks, Habitica, Loop Habit Tracker

---

## MVP Scope

### Phase 1: Core ✓
- [x] Collection schema + basic views
- [x] Dashboard with habit cards (quick log buttons, today's checklist, cards grid)
- [x] Command palette integration ("Log Habits")
- [ ] Journal scanning - scan for `[x] [[Habit]]` entries
- [ ] Habit page log - write daily totals to habit page body
- [ ] Stats calculation - streak, weekly_total, trend from log data

### Phase 2: Journal Integration
- [ ] Parse value from journal entries (30m, 5, etc.)
- [ ] Journal summary section (## Habits with column layout)
- [ ] "Show in Journal" field per habit
- [ ] Rating emoji calculation (😊 😐 😞 based on target)
- [ ] Investigate SDK column support

### Phase 3: Polish
- [ ] Auto-populate journal on creation (scheduled habits as unchecked items)
- [ ] Sparklines with real data
- [ ] Heatmap visualization (Analysis view)
- [ ] Goal progress tracking
- [ ] Period toggle (Week/Month/Quarter/Year) in Analysis view

### Phase 4: Agent Integration
- [ ] Register tools with SyncHub (log_habit, get_habit_stats, etc.)
- [ ] Agent-powered summaries (daily/weekly)
