# Thymer Sync Hub v1.2.0

## Highlights

### Flow Plugin (PRERELEASE ALPHA)
A new focus companion plugin for planning your day and tracking work sessions:
- Visual day planner with drag-and-drop task scheduling
- Focus session tracking with timer and progress display
- Side-by-side layout for overlapping events
- Task duration estimates with resize-to-adjust
- Integration with PlannerHub tasks and calendar events

**Note:** Flow is in early alpha. See `plugins/flow/README.md` for installation instructions.

### Google Calendar Improvements (PR #23)
- Properly updates titles on renamed events (fixes repeated sync updates)
- Deleted events now prefixed with [X] instead of being removed
- Preserves all information from deleted events

### PlannerHub Enhancements
- New Slot API for time-series data storage
- Improved SDK timing with GUID caching
- Foundation for Flow event logging (coming soon)

## Upgrading

Update all components in order:
1. Sync Hub (`synchub/`)
2. Collections (`collections/`)
3. PlannerHub (`plannerhub/`)
4. All sync plugins you use

## Full Changelog

See commit history for detailed changes since v1.0.3.
