# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Thymer Sync Hub is a plugin architecture for syncing external data sources into [Thymer](https://thymer.com). It uses the **Laundromat Architecture**: "Same baskets. Different machines."

- **Sync Hub**: A CollectionPlugin orchestrator that schedules syncs and exposes `window.syncHub` API
- **Collections**: Source-agnostic schemas (Issues, Captures, Calendar) - the "clean baskets"
- **Sync Plugins**: AppPlugins that fetch from external APIs (GitHub, Readwise, etc.) - the "washing machines"

## Repository Structure

```
synchub/           # The orchestrator plugin (CollectionPlugin)
  plugin.js        # Sync Hub core - schedules syncs, manages registrations
  collection.json  # Schema for plugin configs (tokens, intervals, status)

collections/       # Shared collection schemas
  issues/          # For GitHub/GitLab/Jira issues
  captures/        # For Readwise highlights, web clips
  calendar/        # For Google Calendar events
  people/          # For contacts and relationships (CRM-style)

plugins/           # Sync plugins (AppPlugins)
  _template/       # Template with CLAUDE.md guide
  github/          # GitHub Issues & PRs
  readwise/        # Readwise Reader highlights
  google-calendar/ # OAuth-based calendar sync
  google-contacts/ # OAuth-based contacts sync (RESTRICTED scope)
  telegram/        # Multi-collection router (journal/captures/issues)
```

## Common Commands

```bash
# List available tasks
task

# Create new plugin from template
task new:plugin -- my-source

# Copy plugin to clipboard for Thymer
task copy:plugin -- github
task copy:synchub

# Validate JSON files
task validate:json
task validate:plugins

# Get file path (when clipboard doesn't work)
task path:plugin -- github
```

## SDK References

- [Thymer Plugin SDK](https://github.com/thymerapp/thymer-plugin-sdk) - Official SDK with type definitions
- [Template CLAUDE.md](plugins/_template/CLAUDE.md) - Comprehensive patterns for AI-assisted plugin development
- [SDK Notes](docs/sdk-notes.md) - Gotchas and workarounds

## Critical SDK Patterns

### Plugin Registration

Use `synchub-ready` event, NOT polling:

```javascript
async onLoad() {
    window.addEventListener('synchub-ready', () => this.register());
    if (window.syncHub) this.register();
}
```

### Record Creation Quirk

After `createRecord()`, wait before accessing:

```javascript
const guid = collection.createRecord(title);
await new Promise(r => setTimeout(r, 50));  // SDK quirk
const records = await collection.getAllRecords();
const record = records.find(r => r.guid === guid);
```

### Choice Fields

`setChoice()` matches by **label**, not ID:

```javascript
// If choices are [{id: 'gh', label: 'GitHub'}, ...]
record.prop('source')?.setChoice('GitHub');  // Use label!
```

### Logging

- `debug()` for routine messages (silent at Info level)
- `log()` only for errors
- Always use optional chaining: `record.prop('field')?.set(value)`

### Deduplication

Always check `external_id` before creating records:

```javascript
const existing = records.find(r => r.text('external_id') === `source_${item.id}`);
```

## Plugin Development Workflow

1. Copy template: `task new:plugin -- my-source`
2. Update `plugin.json` with name, icon, description
3. Implement `sync({ data, ui, log, debug })` function
4. Set Log Level to "Debug" in Sync Hub for testing
5. Test with: `window.syncHub.requestSync('my-source-sync')`
6. Copy to Thymer: `task copy:plugin -- my-source`

## Architecture Deep Dive

See [docs/architecture.md](docs/architecture.md) for the Laundromat philosophy and [CREATING_PLUGINS.md](CREATING_PLUGINS.md) for detailed walkthrough.
