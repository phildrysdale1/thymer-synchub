# Thymer Sync Hub

A suite of plugins for [Thymer](https://thymer.com): sync external data, chat with AI agents, and track habits.

## What's Included

| Plugin | Type | Description |
|--------|------|-------------|
| **[Sync Hub](synchub/)** | Orchestrator | Schedules syncs, manages plugin configs |
| **[Agent Hub](agenthub/)** | AI Agents | Chat with Claude/GPT/local LLMs on any page |
| **[HabitHub](habithub/)** | Standalone | Track habits and break vices *(pre-release)* |
| **[Collections](collections/)** | Data | Shared schemas for Issues, Captures, Calendar, People |
| **[Sync Plugins](plugins/)** | Integrations | GitHub, Readwise, Google Calendar, Telegram, etc. |

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              THYMER                                        │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                         AGENT HUB                                    │ │
│  │                    (the AI operators)                                │ │
│  │       ┌──────┐ ┌──────┐ ┌──────┐                                    │ │
│  │       │Claude│ │ Qwen │ │Llama │  ← Chat on any page                │ │
│  │       └──┬───┘ └──┬───┘ └──┬───┘                                    │ │
│  │          └────────┴────────┘                                         │ │
│  │                   │ uses collection tools                            │ │
│  └───────────────────┼──────────────────────────────────────────────────┘ │
│                      ▼                                                     │
│  ┌────────────────────────────────────────┐  ┌────────────────────────┐  │
│  │           SYNC COLLECTIONS             │  │  STANDALONE PLUGINS    │  │
│  │      (baskets with built-in tools)     │  │                        │  │
│  │                                        │  │  ┌──────────────────┐  │  │
│  │  ISSUES    CAPTURES   CALENDAR  PEOPLE │  │  │    HABIT HUB     │  │  │
│  │  find()    find()     today()   find() │  │  │  (pre-release)   │  │  │
│  │  search()  search()   upcoming()search()│  │  │                  │  │  │
│  │  get()     recent()   needs_    needs_ │  │  │  Journal input   │  │  │
│  │  summarize by_book()  followup  contact│  │  │  Dashboard input │  │  │
│  │            ▲                           │  │  │  → Habit logs    │  │  │
│  │  ┌─────────┴─────────┐                 │  │  │  → Stats/Streaks │  │  │
│  │  │     SYNC HUB      │ (orchestrator)  │  │  └──────────────────┘  │  │
│  │  └─────────┬─────────┘                 │  │                        │  │
│  │  ┌─────────┴──────────────────────┐    │  │  (future standalone   │  │
│  │  │       SYNC PLUGINS             │    │  │   plugins go here)    │  │
│  │  │  GitHub → Issues               │    │  │                        │  │
│  │  │  Readwise → Captures           │    │  └────────────────────────┘  │
│  │  │  Google Calendar → Calendar    │    │                              │
│  │  │  Google Contacts → People      │    │                              │
│  │  │  Telegram → Journal/Captures   │    │                              │
│  │  └────────────────────────────────┘    │                              │
│  └────────────────────────────────────────┘                              │
└───────────────────────────────────────────────────────────────────────────┘
```

**Two architectures, one repo:**

- **Sync Architecture** (left): External data flows through Sync Hub into shared Collections. Agents query collections with built-in tools.
- **Standalone Plugins** (right): Self-contained plugins like HabitHub that manage their own data and UI.

Both can be used independently or together.

### Why Collections Own Tools

When you add a Jira plugin, it syncs to the Issues collection. The Issues collection already has `find()`, `search()`, and `summarize_open()` tools. Agents can immediately query Jira issues without any new tool code.

```
GitHub  ──┐
GitLab  ──┼──→ Issues Collection ──→ find(), search(), get()
Jira    ──┘         (one set of tools for all sources)
```

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
| [Google Contacts](plugins/google-contacts/) | People | Working | OAuth via thymer-self-auth (RESTRICTED scope) |
| [Telegram](plugins/telegram/) | Multi | Working | Smart routing to Journal/Captures/Issues |

## Quick Start

### 1. Install Collections

Create Collection Plugins in Thymer for each basket you need:

**Sync Hub** (required):
- Paste `synchub/collection.json` → Configuration
- Paste `synchub/plugin.js` → Custom Code

**Issues** (for GitHub, GitLab, Jira, etc.):
- Paste `collections/issues/collection.json` → Configuration
- Paste `collections/issues/plugin.js` → Custom Code (provides query tools)

**Captures** (for Readwise, web clips, etc.):
- Paste `collections/captures/collection.json` → Configuration
- Paste `collections/captures/plugin.js` → Custom Code (provides query tools)

**Calendar** (for Google Calendar, Outlook, etc.):
- Paste `collections/calendar/collection.json` → Configuration
- Paste `collections/calendar/plugin.js` → Custom Code (provides query tools)

**People** (for Google Contacts, LinkedIn, etc.):
- Paste `collections/people/collection.json` → Configuration
- Paste `collections/people/plugin.js` → Custom Code (provides query tools)

**Chats** (for AI conversations):
- Paste `collections/chats/collection.json` → Configuration

### 2. Install AgentHub (Optional but Recommended)

Create a **Collection Plugin** for AI agents:

1. Paste `agenthub/collection.json` → Configuration
2. Paste `agenthub/plugin.js` → Custom Code
3. Create agents with names, providers, and API keys
4. Chat on any page via Command Palette

See [AgentHub docs](agenthub/) for full setup.

### 3. Install Sync Plugins (Optional)

Create App Plugins for each source you want to sync:

**GitHub Sync**:
- Paste `plugins/github/plugin.js` → Custom Code

**Readwise Sync**:
- Paste `plugins/readwise/plugin.js` → Custom Code

**Google Calendar Sync**:
- Paste `plugins/google-calendar/plugin.js` → Custom Code

**Google Contacts Sync**:
- Paste `plugins/google-contacts/plugin.js` → Custom Code

**Telegram Sync**:
- Paste `plugins/telegram/plugin.js` → Custom Code

### 4. Configure Each Plugin

In the Sync Hub collection, each plugin auto-creates its record. Configure:

| Plugin | Config Field |
|--------|--------------|
| GitHub | `token`: Personal access token<br>`config`: `{"projects": {"owner/repo": "Project Name"}}` maps repos to project labels |
| Readwise | `token`: Readwise access token |
| Google Calendar | `config`: `{"auth_url": "..."}` (optional, has default)<br>`token`: set by OAuth |
| Google Contacts | `config`: `{"auth_url": "https://your-endpoint/google?service=contacts"}` (required)<br>`token`: set by OAuth<br>**Note:** Enable [People API](https://console.developers.google.com/apis/api/people.googleapis.com) in your GCP project |
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

## Dashboard

Switch to the **Dashboard** view in the Sync Hub collection to see all plugins at a glance:

```
┌─────────────────────────────┐
│  ◉ GitHub                   │  ← Status indicator
│         5m                  │  ← Sync interval
│       interval              │
│    ● synced 5m ago          │  ← Last sync time
│  ┌──────┐ ┌──────┐          │
│  │ Sync │ │ Full │          │  ← Action buttons
│  └──────┘ └──────┘          │
└─────────────────────────────┘
```

Each card shows:
- **Status dot**: Green (healthy), Yellow (stale), Red (error)
- **Sync button**: Trigger incremental sync
- **Full button**: Clear history and sync everything
- **Connect button**: OAuth flow (for Google plugins)

## Command Palette

- **Sync Hub: Sync All** - Trigger all enabled syncs
- **Sync Hub: Reset Stuck Syncs** - Reset any stuck "Syncing" statuses
- **Paste Markdown** - Insert markdown into current record

## Creating New Plugins

### Quick Start

1. Copy `plugins/_template/` to `plugins/my-source/`
2. Replace placeholders in `plugin.js`:
   - `PLUGIN_ID` → `my-source-sync`
   - `PLUGIN_NAME` → `My Source`
   - `PLUGIN_ICON` → Tabler icon name (e.g., `brand-slack`)
   - `TARGET_COLLECTION` → Target collection name
3. Update `plugin.json` with name, icon, description
4. Implement `fetchFromSource()` and `mapItemToRecord()`

### Using Claude Code

The template includes `CLAUDE.md` with all patterns and gotchas for AI-assisted development:

```bash
# In your plugin folder
cat plugins/_template/CLAUDE.md
```

This teaches Claude Code about:
- Registration with `synchub-ready` event
- `log()` vs `debug()` usage
- Deduplication with `external_id`
- DateTime and Choice field handling
- Journal access with late-night fallback
- CORS workarounds for web fetching

### Key Pattern

```javascript
class Plugin extends AppPlugin {
    async onLoad() {
        // Listen for Sync Hub ready (NOT polling!)
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
        // debug() for routine messages (silent at Info level)
        // log() only for errors
        debug('Fetching...');

        // Fetch from source, create/update records
        // Return changes array for journal logging
        return {
            summary: '3 new items',
            created: 3,
            updated: 0,
            changes: [
                { verb: 'created', title: null, guid: recordGuid, major: true }
            ]
        };
    }
}
```

### Documentation

- [Template CLAUDE.md](plugins/_template/CLAUDE.md) - AI-friendly patterns guide
- [CREATING_PLUGINS.md](CREATING_PLUGINS.md) - Detailed walkthrough
- [SDK Notes](docs/sdk-notes.md) - Gotchas and workarounds

## Collection Tools

Each collection provides query tools that agents can use. Tools are source-agnostic — they work with data from any sync plugin.

| Collection | Tools | Description |
|------------|-------|-------------|
| **Issues** | `find`, `get`, `search`, `summarize_open` | Query issues by state, repo, type, assignee |
| **Captures** | `find`, `search`, `recent`, `by_book` | Find highlights by source, author, or content |
| **Calendar** | `find`, `today`, `upcoming`, `needs_followup`, `search` | Query events by date, calendar, or status |
| **People** | `find`, `search`, `needs_contact`, `at_organization`, `recent_contacts` | Find contacts, track relationship health |

Example agent interaction:
```
User: What are my open bugs?

Agent: [calls Issues.find(state="Open", type="Bug")]
       You have 3 open bugs:
       - [[guid1]] Fix login timeout
       - [[guid2]] API rate limit issue
       - [[guid3]] Mobile layout broken
```

## Documentation

- [AgentHub](agenthub/) - AI agents that chat on pages and use collection tools
- [Running Local AI Models](agenthub/RUNNING_LOCAL.md) - HTTPS/CORS setup for local LLMs (MLX, Ollama) with Caddy + Cloudflare
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
