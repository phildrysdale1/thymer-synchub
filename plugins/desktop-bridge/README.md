# Desktop Bridge Plugin

Browser-side plugin that connects Thymer to [thymer-bar](../../desktop/) for MCP and CLI integration.

## What It Does

The Desktop Bridge is an **App Plugin** that:

1. **Connects to thymer-bar** via WebSocket (`ws://127.0.0.1:9848`)
2. **Pushes collection tools** to the desktop app for MCP exposure
3. **Shows connection status** in Thymer's status bar
4. **Logs activity** when AI assistants call tools

## Status Bar

When active, adds a wand icon to Thymer's status bar:

| Icon State | Meaning |
|------------|---------|
| 🪄 Purple | Connected to thymer-bar |
| 🪄 Glowing | Tool call in progress |
| 🪄 Muted | Disconnected |

**Click** the icon for:
- Connection status and tool count
- Connect/Disconnect actions
- Activity log showing recent tool calls

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Thymer (Browser)                                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │  SyncHub                                       │ │
│  │  └── window.syncHub.getRegisteredTools()      │ │
│  └───────────────────────────────────────────────┘ │
│              ↑                                      │
│              │ uses                                 │
│              │                                      │
│  ┌───────────────────────────────────────────────┐ │
│  │  Desktop Bridge (this plugin)                  │ │
│  │  └── WebSocket to thymer-bar                   │ │
│  │  └── Pushes tools on connect                   │ │
│  │  └── Handles tool_call messages                │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                    │
                    │ WebSocket :9848
                    ↓
┌─────────────────────────────────────────────────────┐
│  thymer-bar (Go binary)                             │
│  └── Exposes tools via MCP :9850                    │
│  └── Exposes tools via HTTP :9847                   │
└─────────────────────────────────────────────────────┘
                    │
                    │ MCP
                    ↓
┌─────────────────────────────────────────────────────┐
│  Claude Code / Claude Desktop / Other MCP Clients   │
└─────────────────────────────────────────────────────┘
```

## Installation

### 1. Build and run thymer-bar

thymer-bar is a Go command-line app that needs to be compiled:

```bash
# From repo root
make desktop

# Or directly
cd desktop && go build -o thymer-bar .

# Run it
./desktop/thymer-bar
```

This starts the system tray app with WebSocket, HTTP, and MCP servers.

### 2. Install the browser plugin

1. Create an **App Plugin** in Thymer
2. Paste `plugin.js` into Custom Code
3. Ensure SyncHub is also installed (provides the tools)

The plugin auto-connects when thymer-bar is running.

## Configuration

No configuration needed. The plugin automatically:
- Connects to `ws://127.0.0.1:9848` on load
- Reconnects if connection drops
- Re-pushes tools when collections change

## Why a Separate Plugin?

The Desktop Bridge was extracted from SyncHub to:

1. **Keep SyncHub focused** on sync orchestration
2. **Make desktop integration optional** - not everyone needs MCP
3. **Simplify maintenance** - bridge code in one place
4. **Enable independent updates** - update bridge without touching sync logic

## Activity Log

The plugin maintains a rolling log of the last 50 tool calls:

```
✓ search_workspace {"query":"meeting"} 45ms
✓ calendar_today {} 32ms
✓ log_to_journal {"content":"..."} 28ms
✗ get_note {"guid":"invalid"} 12ms
```

Access via the wand icon popup → "Activity Log".

## Troubleshooting

### Not connecting

1. Check thymer-bar is running: `ps aux | grep thymer-bar`
2. Check port 9848 is available: `lsof -i :9848`
3. Look for errors in browser console

### Tools not showing

1. Ensure SyncHub is installed and has registered tools
2. Check `window.syncHub.getRegisteredTools()` in console
3. Reload the page to trigger re-push

### Activity log empty

The log only shows calls made via MCP through thymer-bar. Direct browser-based tool calls (like from AgentHub) don't appear here.

## See Also

- [thymer-bar](../../desktop/) - The desktop app this plugin connects to
- [SyncHub](../../synchub/) - The orchestrator that provides collection tools
- [MCP Specification](https://modelcontextprotocol.io/) - The protocol used for AI integration
