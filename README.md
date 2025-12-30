# Thymer Sync Hub

A plugin architecture for syncing external data sources into [Thymer](https://thymer.com).

## The Laundromat Architecture

```
                    THE LAUNDROMAT

    ┌─────────────────────────────────────────────┐
    │                 SYNC HUB                     │
    │           (the orchestrator)                │
    │                                             │
    │   ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐       │
    │   │ GH  │  │ GL  │  │Jira │  │ ... │       │
    │   └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘       │
    │      │        │        │        │          │
    │      └────────┴────────┴────────┘          │
    │                   │                         │
    │         ┌────────┴────────┐                │
    │         ▼        ▼        ▼                │
    │      ISSUES  CAPTURES  EVENTS              │
    │      (baskets of clean laundry)            │
    └─────────────────────────────────────────────┘
```

**Same baskets. Different machines.**

- **Sync Hub**: The orchestrator that schedules and runs sync plugins
- **Collections**: Source-agnostic "real world objects" (Issues, Captures, Events)
- **Plugins**: "Washing machines" that fetch from sources and output clean data

## Quick Start

### 1. Install Sync Hub

Create a new Collection Plugin in Thymer:
- Paste `synchub/collection.json` into the Configuration tab
- Paste `synchub/plugin.js` into the Custom Code tab

### 2. Install a Collection

Create a new Collection Plugin (e.g., Issues):
- Paste `collections/issues/collection.json` into the Configuration tab

### 3. Install a Sync Plugin

Create a new Global Plugin (e.g., GitHub):
- Paste `plugins/github/plugin.json` into the Configuration tab
- Paste `plugins/github/plugin.js` into the Custom Code tab

### 4. Configure

In the Sync Hub collection, create a record for your plugin:
- **Plugin ID**: `github-sync`
- **Enabled**: Yes
- **Interval**: 5 min
- **Token**: Your GitHub personal access token
- **Config**: `{"repos": ["owner/repo1", "owner/repo2"]}`

## Creating New Plugins

See [CREATING_PLUGINS.md](CREATING_PLUGINS.md) for a guide, or copy `plugins/_template/`.

## Documentation

- [Architecture](docs/architecture.md) - The Laundromat explained
- [SDK Notes](docs/sdk-notes.md) - Gotchas and workarounds
- [Field Mappings](docs/field-mappings.md) - Mapping source fields to collections

## Available Plugins

| Plugin | Collection | Status |
|--------|------------|--------|
| GitHub | Issues | Working |
| GitLab | Issues | Template |
| Jira | Issues | Planned |
| Linear | Issues | Planned |
| Readwise | Captures | Planned |
| Google Calendar | Events | Planned |

## License

MIT
