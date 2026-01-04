# thymer-bar

System tray app that bridges [Thymer](https://thymer.com) to CLI tools and AI assistants via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

Written in Go with [fyne.io/systray](https://github.com/fyne-io/systray) for cross-platform support.

## Features

- **System tray** with connection status and quick actions
- **MCP server** for AI assistants (Claude, etc.)
- **HTTP API** for CLI and custom integrations
- **WebSocket bridge** to SyncHub in the browser
- **Cross-platform**: Linux, macOS, Windows

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Thymer (Browser)                                                       │
│  └── SyncHub Plugin ──────────────────────┐                             │
│       └── Exposes collection tools        │                             │
│       └── Shows MCP status (🪄 wand icon) │                             │
└───────────────────────────────────────────┼─────────────────────────────┘
                                            │ WebSocket
                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  thymer-bar (Go binary, ~12MB)                                          │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  System Tray                                                       │ │
│  │  ├── Status: ● Connected (23 tools)                                │ │
│  │  ├── Open Thymer                                                   │ │
│  │  ├── Sync All                                                      │ │
│  │  └── Quit                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │ WebSocket :9848     │  │ HTTP API :9847      │  │ MCP :9850       │ │
│  │ ◄── SyncHub browser │  │ ◄── CLI tools       │  │ ◄── AI clients  │ │
│  │     connects here   │  │     query here      │  │     (Claude)    │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ MCP (JSON-RPC)
                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Claude Desktop / Claude Code / Other MCP Clients                       │
│  └── Uses tools: search_workspace, get_note, log_to_journal, etc.       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Installation

### Build from Source

```bash
# From repo root
make desktop

# Or directly
cd desktop
go build -o thymer-bar .
```

### Run

```bash
# With system tray (default)
./thymer-bar

# Headless mode (no tray, just servers)
./thymer-bar --headless

# Custom ports
./thymer-bar --http=8080 --ws=8081 --mcp=8082

# Disable MCP server
./thymer-bar --mcp=0
```

## Configuration

Config file: `~/.config/thymer-desktop/config.json`

```json
{
  "workspace": "myworkspace.thymer.com"
}
```

The workspace is auto-detected from the first SyncHub connection.

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 9847 | HTTP | REST API for CLI and custom tools |
| 9848 | WebSocket | SyncHub browser connection |
| 9850 | HTTP | MCP server for AI assistants |

## MCP Server

The MCP server implements the [Model Context Protocol](https://modelcontextprotocol.io/) for AI assistant integration.

### Stateless Design

The MCP endpoint (`http://127.0.0.1:9850/`) is **stateless** - each request is independent, no session management required. This avoids reconnection issues when thymer-bar restarts.

### Configuring Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "thymer": {
      "type": "url",
      "url": "http://127.0.0.1:9850"
    }
  }
}
```

Then restart Claude Code or run `/mcp` to reconnect.

### Configuring Claude Desktop

Add to Claude Desktop's config:

```json
{
  "mcpServers": {
    "thymer": {
      "command": "thymer",
      "args": ["mcp", "serve"]
    }
  }
}
```

This uses stdio transport via the CLI.

### Available Tools

**Core Tools:**

| Tool | Parameters | Description |
|------|------------|-------------|
| `search_workspace` | `query`, `limit?` | Search across all notes and collections |
| `list_collections` | - | List available collections with schemas |
| `get_note` | `guid` | Get a note's title, fields, and body |
| `append_to_note` | `guid`, `content` | Append markdown to a note |
| `get_todays_journal` | - | Get today's daily note |
| `log_to_journal` | `content` | Append to today's journal |

**Collection Tools** (when collections are installed):

| Collection | Tools |
|------------|-------|
| Calendar | `calendar_today`, `calendar_upcoming`, `calendar_find`, `calendar_search`, `calendar_needs_followup` |
| Issues | `issues_find`, `issues_get`, `issues_search`, `issues_summarize_open` |
| Captures | `captures_find`, `captures_search`, `captures_recent`, `captures_by_book` |
| People | `people_find`, `people_search`, `people_needs_contact`, `people_at_organization`, `people_recent_contacts` |

### Tool Design Philosophy

**Safe implicit targets:**
- `get_todays_journal` and `log_to_journal` always target today's daily note
- Predictable behavior regardless of which Thymer window is active

**Explicit GUID required:**
- `get_note` and `append_to_note` require a GUID (from search results)
- Prevents accidental writes to wrong notes

We intentionally removed "active record" tools because:
- User might have multiple Thymer windows open
- Unpredictable which window would be affected
- Could lead to data in wrong places

## HTTP API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Connection status, tool count, plugins |
| GET | `/api/query?collection=X` | Query a collection |
| POST | `/api/sync` | Trigger plugin sync |
| POST | `/api/capture` | Quick capture to journal |
| GET | `/api/mcp/tools` | List available MCP tools |
| POST | `/api/mcp/call` | Execute a tool call |
| GET | `/health` | Health check |

### Examples

```bash
# Check status
curl http://127.0.0.1:9847/api/status

# Query open issues
curl "http://127.0.0.1:9847/api/query?collection=issues&state=Open"

# Trigger GitHub sync
curl -X POST http://127.0.0.1:9847/api/sync \
  -H "Content-Type: application/json" \
  -d '{"plugin": "github-sync"}'

# Quick capture
curl -X POST http://127.0.0.1:9847/api/capture \
  -H "Content-Type: application/json" \
  -d '{"text": "Remember to check the logs"}'

# Execute MCP tool
curl -X POST http://127.0.0.1:9847/api/mcp/call \
  -H "Content-Type: application/json" \
  -d '{"name": "search_workspace", "args": {"query": "lizard"}}'
```

## SyncHub UI Integration

When thymer-bar is connected, SyncHub shows status indicators in the Thymer status bar:

### Icons

| Icon | Name | States |
|------|------|--------|
| 🖥️ | `ti-server` | Green=idle, Blue glow=syncing, Red=error |
| 🪄 | `ti-wand` | Purple=connected, Glow=activity, Muted=disconnected |

### MCP Activity Indicator

The wand icon glows purple on each tool call - like an HDD activity LED. This gives visual feedback that Claude is actively using your Thymer data.

### Popup Menu

Click the wand icon to see:

```
┌──────────────────────────────┐
│ MCP STATUS                   │
│ ✓ Connected (23 tools)       │
│   Connected 5 min ago        │
├──────────────────────────────┤
│ ↻ Reconnect                  │
│ ⊘ Disconnect                 │
│ ≡ Show Tools (console)       │
├──────────────────────────────┤
│ ⚡ Activity Log              │
└──────────────────────────────┘
```

### Activity Log

The activity log shows recent MCP tool calls:

```
┌─────────────────────────────────────────┐
│ ⚡ MCP Activity                      ✕  │
├─────────────────────────────────────────┤
│ ✓ search_workspace {"query":"lizard"} 45ms │
│ ✓ get_note {"guid":"ABC123..."}      32ms │
│ ✓ log_to_journal {"content":"..."}   28ms │
│ ✗ append_to_note {"guid":"..."}      12ms │
└─────────────────────────────────────────┘
```

- ✓ Green = success
- ✗ Red = error
- ⟳ Spinning = in progress
- Hover for full arguments
- Updates in real-time

## How It Works

1. **Start thymer-bar** - listens on ports 9847 (HTTP), 9848 (WebSocket), 9850 (MCP)

2. **Open Thymer** in browser with SyncHub installed

3. **SyncHub auto-connects** to `ws://127.0.0.1:9848` and pushes available tools

4. **MCP server activates** once tools are received

5. **Claude connects** to `http://127.0.0.1:9850` and can now use Thymer tools

6. **Tool calls flow**: Claude → MCP → thymer-bar → WebSocket → SyncHub → Thymer

## Troubleshooting

### SyncHub not connecting

- Check that thymer-bar is running (`ps aux | grep thymer`)
- Check WebSocket port is free (`lsof -i :9848`)
- Look for connection errors in browser console

### MCP tools not working

- Ensure SyncHub is connected (wand icon should be purple)
- Run `/mcp` in Claude Code to reconnect
- Check activity log for errors

### "Session not found" errors

This shouldn't happen with the stateless endpoint. If it does:
- You might be using the `/mcp` endpoint instead of `/`
- Run `/mcp` to reconnect Claude Code

## Development

```bash
# Run with live reload
make dev

# Run headless for testing
make headless

# Build for all platforms
GOOS=darwin GOARCH=arm64 go build -o thymer-bar-mac .
GOOS=linux GOARCH=amd64 go build -o thymer-bar-linux .
GOOS=windows GOARCH=amd64 go build -o thymer-bar.exe .
```

## License

MIT
