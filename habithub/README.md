# HabitHub

**Pre-release** - This plugin is under active development. Features may change and some functionality is incomplete.

A habit tracking system built on Thymer's native primitives. Track positive habits and break vices with journal-powered logging, beautiful dashboards, and streak tracking.

## Philosophy

**Habit logs are the source of truth. Multiple inputs, one dashboard.**

HabitHub aggregates habit data from multiple sources:
- **Journal entries** - Natural logging as part of your day
- **Dashboard buttons** - Quick +1/+10 logging
- **Future integrations** - API, agents, automations

All inputs write to the habit page log, which is the single source of truth for stats and visualization.

## Features

### Dashboard View

The main dashboard provides at-a-glance visibility into your habits:

- **Quick Log Buttons** - +1 and +10 buttons per habit for fast logging
- **Today's Habits** - Checklist showing completion status with targets
- **Weekly Cards** - Singlestat-style cards with streaks and sparklines
- **Summary Row** - Total habits, today's completion, best streak

### Habit Cards

Each habit displays:
- Emoji icon and name
- Schedule type (daily, weekdays, weekends, weekly)
- Current streak with fire/ice badge
- Weekly total or days below target (for vices)
- 7-day sparkline showing recent activity
- Progress toward weekly target

### Vice Tracking

Vices (habits you want to reduce) have inverted logic:
- **Success** = staying at or below your daily target
- **Streak** = consecutive days under target (shown with ice badge)
- **Card color** = green/amber/red based on weekly success ratio
- **Sparkline** = color-coded bars showing daily values vs target

### Journal Integration

HabitHub scans your daily journal for habit entries:

```markdown
## Habits
- [x] [[Exercise]] 30m      <- checked = import this
- [x] [[Read]] 45m
- [ ] [[Meditation]]        <- unchecked = skip (not done yet)
- [x] [[Smoking]] 5         <- vice with count
```

When processed, entries are replaced with summaries:
```
✓ 30m Exercise 🏃 | 15m to go
✓ Read 📚 | target hit!
✓ 5 Smoking 🚬 | 15 left
```

### Habit Page Logs

Each habit page maintains a structured log:

```markdown
## Log
2025-01-03 - 45m
2025-01-02 - 30m
2025-01-01 - 60m
```

Log entries use line item props (`habit_date`, `habit_value`) for fast lookups. The text is human-readable but props are the source of truth for stats.

**Important**: Log entries should not be manually edited. A warning banner is displayed at the top of the log section.

## Collection Schema

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Habit name (e.g., "Exercise") |
| `command` | text | Trigger word for matching |
| `emoji` | choice | Visual icon (🏃, 📚, 🚬, etc.) |
| `kind` | choice | `habit` (more is better) or `vice` (less is better) |
| `value_type` | choice | `boolean`, `duration`, or `count` |
| `schedule` | choice | `daily`, `weekdays`, `weekends`, `weekly` |
| `target` | number | Daily target value |
| `weekly_target` | number | Weekly target (overrides daily × days) |
| `unit` | text | Display unit (m, km, books, etc.) |
| `verb` | text | Action word for buttons (e.g., "Pushup") |
| `goal_value` | number | Long-term goal |
| `goal_date` | datetime | Goal deadline |
| `enabled` | choice | Yes/No - whether to show in dashboard |

### Views

1. **Dashboard** (custom) - Visual overview with cards and sparklines
2. **Analysis** (custom) - Trends and heatmaps (coming soon)
3. **All Habits** (table) - Full list with stats
4. **By Kind** (board) - Grouped into habits vs vices
5. **By Schedule** (board) - Grouped by frequency

## Commands

Access via Command Palette (Ctrl+K):

| Command | Description |
|---------|-------------|
| **Log Habits** | Opens quick-log popup (coming soon) |
| **HabitHub: Sync Journal** | Scan today's journal for habit entries |
| **HabitHub: Dump Page Props** | Debug: show line item props in console |

## Value Types

| Type | Example | Journal Syntax |
|------|---------|----------------|
| `boolean` | Woke early, Made bed | `- [x] [[Woke Early]]` |
| `duration` | Exercise, Reading | `- [x] [[Exercise]] 30m` |
| `count` | Pushups, Cigarettes | `- [x] [[Smoking]] 5` |

## Streak Logic

### Habits (more is better)
- Streak increments when you log the habit
- Streak breaks if you miss a day
- Fire badge shows current streak

### Vices (less is better)
- Streak increments when you stay at or below target
- Streak breaks if you exceed target
- Ice badge shows days under control

## Technical Details

### Props-Based Storage

Log entries store structured data in line item props:
- `habit_date` - ISO date string (YYYY-MM-DD)
- `habit_value` - Numeric value logged

This enables instant stats calculation without text parsing. Props persist across page loads but do not survive copy/paste operations.

### Stats Calculation

Stats are calculated on-demand from log entries:
- `total` - All-time sum of values
- `weeklyTotal` - Sum for last 7 days
- `todayTotal` - Today's value
- `streak` - Current consecutive days
- `bestStreak` - All-time best streak

### Dashboard Refresh

The dashboard uses Thymer's refresh infrastructure:
- Touching `updated_at` triggers view refresh
- `isRendering` guard prevents flickering
- Stats are pre-fetched once and reused

## Roadmap

### Phase 1: Core (current)
- [x] Collection schema + basic views
- [x] Dashboard with habit cards
- [x] Quick log buttons (+1, +10)
- [x] Journal scanning
- [x] Props-based log storage
- [x] Stats calculation from logs
- [x] Vice cards with weekly ratio

### Phase 2: Journal Integration
- [ ] Journal summary section (## Habits with column layout)
- [ ] Auto-populate journal on creation
- [ ] Rating emoji calculation
- [ ] "Show in Journal" field per habit

### Phase 3: Polish
- [ ] Analysis view with heatmaps
- [ ] Goal progress tracking
- [ ] Period toggle (Week/Month/Quarter/Year)
- [ ] Sparklines with trend indicators

### Phase 4: Agent Integration
- [ ] Register tools with SyncHub
- [ ] Agent-powered daily/weekly summaries
- [ ] Conversational logging

## Known Issues

- Log entries don't survive copy/paste (props are lost)
- Manual edits to log text will desync from props
- Quick-log popup not yet implemented
- Analysis view is placeholder only

## Dependencies

- Thymer Plugin SDK
- SyncHub (for `insertMarkdown` helper)

## License

Part of the Thymer Sync Hub project.
