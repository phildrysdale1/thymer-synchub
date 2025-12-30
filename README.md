# Thymer Sync Hub

A plugin architecture for syncing external data sources into [Thymer](https://thymer.com).

## The Laundromat Architecture

```
                    THE LAUNDROMAT

    ┌─────────────────────────────────────────────┐
    │                 SYNC HUB                    │
    │           (the orchestrator)                │
    │                                             │
    │   ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
    │   │GitHub│ │Readwise│ │G. Cal  │ │Telegram│ │
    │   └──┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ │
    │      │         │          │          │      │
    │      └─────────┴──────────┴──────────┘      │
    │                     │                       │
    │         ┌───────────┼───────────┐           │
    │         ▼           ▼           ▼           │
    │      ISSUES     CAPTURES     CALENDAR       │
    │      (baskets of clean laundry)             │
    └─────────────────────────────────────────────┘
```

**Same baskets. Different machines.**

- **Sync Hub**: The orchestrator that schedules and runs sync plugins
- **Collections**: Source-agnostic "real world objects" (Issues, Captures, Calendar)
- **Plugins**: "Washing machines" that fetch from sources and output clean data

## Features

- **Status Bar**: Green/spinning/red indicator showing sync state, click to sync all
- **Smart Scheduling**: Configurable intervals per plugin (1m, 5m, 15m, 1h, manual)
- **Journal Integration**: Sync activity automatically logged to daily journal
- **Toast Notifications**: Configurable alerts for new records, errors, or silent
- **Rate Limit Handling**: Automatic backoff and retry
- **Timeout Protection**: 5-minute max sync time prevents stuck syncs

## Available Plugins

| Plugin | Collection | Status | Notes |
|--------|------------|--------|-------|
| [GitHub](plugins/github/) | Issues | Working | Issues & PRs from multiple repos |
| [Readwise](plugins/readwise/) | Captures | Working | Highlights from Reader |
| [Google Calendar](plugins/google-calendar/) | Calendar | Working | OAuth via thymer-auth worker |
| [Telegram](plugins/telegram/) | Multi | Working | Smart routing to Journal/Captures/Issues |

## Quick Start

### 1. Install Collections

Create Collection Plugins in Thymer for each basket you need:

**Sync Hub** (required):
- Paste `synchub/collection.json` → Configuration
- Paste `synchub/plugin.js` → Custom Code

**Issues**:
- Paste `collections/issues/collection.json` → Configuration

**Captures** (for Readwise):
- Paste `collections/captures/collection.json` → Configuration

**Calendar** (for Google Calendar):
- Paste `collections/calendar/collection.json` → Configuration

### 2. Install Sync Plugins

Create App Plugins for each source:

**GitHub Sync**:
- Paste `plugins/github/plugin.js` → Custom Code

**Readwise Sync**:
- Paste `plugins/readwise/plugin.js` → Custom Code

**Google Calendar Sync**:
- Paste `plugins/google-calendar/plugin.js` → Custom Code

**Telegram Sync**:
- Paste `plugins/telegram/plugin.js` → Custom Code

### 3. Configure Each Plugin

In the Sync Hub collection, each plugin auto-creates its record. Configure:

| Plugin | Config Field |
|--------|--------------|
| GitHub | `token`: Personal access token<br>`config`: `{"repos": ["owner/repo"]}` |
| Readwise | `token`: Readwise access token |
| Google Calendar | `config`: `{"refresh_token": "...", "token_endpoint": "..."}` (from OAuth helper) |
| Telegram | `token`: Bot token from @BotFather |

## Status Bar

The status bar shows sync status at a glance:

```
⟳ ●  (green)    → All syncs idle
⟳ ↻  (spinning) → Sync in progress
⟳ ●  (red)      → Sync error

Click → Trigger all syncs
Hover → See last sync time
```

## Plugin Settings

Each plugin record in Sync Hub has:

| Field | Purpose |
|-------|---------|
| Enabled | Yes/No - whether to run this sync |
| Interval | How often to auto-sync (1m, 5m, 15m, 1h, manual) |
| Journal | Log level for journal entries (None, Major Only, Verbose) |
| Toast | Notification level (All Updates, New Records, Errors Only, None) |
| Log Level | Console logging (Info, Debug) |
| Status | Current state (Idle, Syncing, Error) |
| Last Run | When sync last completed |
| Last Error | Most recent error message |

## Command Palette

- **Sync Hub: Sync All** - Trigger all enabled syncs
- **Sync Hub: Reset Stuck Syncs** - Reset any stuck "Syncing" statuses
- **Paste Markdown** - Insert markdown into current record
- **GitHub Full Sync** / **Incremental Sync**
- **Readwise Full Sync** / **Incremental Sync**
- **Google Calendar Full Sync** / **Sync**
- **Connect Google Calendar** - OAuth flow
- **Telegram Sync**

## Creating New Plugins

See [CREATING_PLUGINS.md](CREATING_PLUGINS.md) for a guide.

Key pattern:
```javascript
class Plugin extends AppPlugin {
    async onLoad() {
        // Listen for Sync Hub ready
        window.addEventListener('synchub-ready', () => this.register());
        if (window.syncHub) this.register();
    }

    async register() {
        await window.syncHub.register({
            id: 'my-plugin-sync',
            name: 'My Plugin',
            sync: async (ctx) => this.sync(ctx),
        });
    }

    async sync({ data, log, debug }) {
        // Fetch from source
        // Create/update records
        // Return { summary, created, updated, changes }
    }
}
```

## Documentation

- [Architecture](docs/architecture.md) - The Laundromat explained
- [SDK Notes](docs/sdk-notes.md) - Gotchas and workarounds
- [Field Mappings](docs/field-mappings.md) - Mapping source fields to collections

## Planned Plugins

- GitLab → Issues
- Jira → Issues
- Linear → Issues
- Outlook Calendar → Calendar
- Google Tasks → Tasks (bidirectional) - [#1](https://github.com/riclib/thymer-synchub/issues/1)

## License

MIT
