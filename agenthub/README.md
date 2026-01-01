# AgentHub

AI agents that live in your Thymer space. Chat with LLMs on any page, with full context from linked records.

## The Smart Laundromat

```
                    THE SMART LAUNDROMAT

    ┌─────────────────────────────────────────────────┐
    │                  AGENT HUB                      │
    │           (the AI operators)                    │
    │                                                 │
    │   ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐        │
    │   │Claude│ │ Qwen │ │Llama │ │Custom │        │
    │   └──┬───┘ └──┬───┘ └──┬───┘ └───┬───┘        │
    │      │        │        │         │            │
    │      └────────┴────────┴─────────┘            │
    │                   │                           │
    │           ┌───────┴───────┐                   │
    │           ▼               ▼                   │
    │      SYNC HUB          TOOLS                  │
    │     (the machines)   (search, create)         │
    └─────────────────────────────────────────────────┘
```

**Agents are the customers who use the laundromat.**

While SyncHub moves data between external sources and Thymer collections, AgentHub provides AI assistants that can:
- Chat on any page with full context
- Use tools registered by SyncHub (search issues, find records, etc.)
- Link to records using `[[GUID]]` syntax
- Support multiple providers (Anthropic, OpenAI, Ollama, custom endpoints)

## How It Relates to SyncHub

| Component | Role | Analogy |
|-----------|------|---------|
| **SyncHub** | Orchestrates plugins, manages collections, registers tools | The laundromat machines |
| **AgentHub** | Provides AI assistants that use SyncHub's infrastructure | The smart customers |
| **Collections** | Store data (Issues, Captures, Chats) | The laundry baskets |
| **Tools** | Actions agents can take (search, create) | The wash/dry buttons |

AgentHub depends on SyncHub for:
- `window.syncHub.parseLine()` - Markdown parsing
- `window.syncHub.getRegisteredTools()` - Tool discovery
- `window.syncHub.executeToolCall()` - Tool execution
- `window.syncHub.logToJournal()` - Activity logging

## Quick Start

### 1. Install SyncHub First

AgentHub requires SyncHub to be installed. See the [main README](../README.md) for SyncHub installation.

### 2. Install AgentHub

Create a **Collection Plugin** in Thymer:

1. **Configuration**: Paste `agenthub/collection.json`
2. **Custom Code**: Paste `agenthub/plugin.js`

### 3. Create Your First Agent

In the AgentHub collection, create a new record:

| Field | Value |
|-------|-------|
| Name | `Claude` |
| Command | `@claude` |
| Enabled | `Yes` |
| Provider | `Anthropic` |
| Model | `Claude Sonnet` |
| API Key | Your Anthropic API key |

### 4. Chat

1. Open any page in Thymer
2. Type your message
3. Open Command Palette (Cmd+K)
4. Select "Chat with Claude"
5. Agent responds inline, nested under its marker

## Providers

| Provider | Models | API Key Required |
|----------|--------|------------------|
| **Anthropic** | Sonnet, Haiku, Opus | Yes |
| **OpenAI** | GPT-4o, GPT-4o-mini | Yes |
| **Ollama** | Any local model | No |
| **Custom** | Any OpenAI-compatible endpoint | Optional |

### Custom Endpoint Example (MLX/Qwen)

For local models via MLX:

| Field | Value |
|-------|-------|
| Provider | `Custom` |
| Model | `Custom` |
| Custom Model | `mlx-community/Qwen2.5-32B-Instruct-4bit` |
| Custom Endpoint | `https://your-server:8080/v1/chat/completions` |

## Features

### Chat on Any Page

Unlike traditional chatbots, AgentHub agents chat *on* your pages:

```
My question about [[Some Record]]

**Claude 🤖:**
   Here's my answer based on the linked context...
   - Point 1
   - Point 2
```

### Linked Context Resolution

When you link records in your message using `[[GUID]]`, AgentHub:
1. Resolves the link to its full content
2. Prepends it as "Linked Context" to your message
3. Replaces `[[GUID]]` with `"Title"` so the LLM sees readable text

### Nested Responses

Agent responses are **children** of the agent marker, making conversation structure clear:

```
User message (top-level)
**Agent 🤖:** (top-level)
  └── Response line 1 (child)
  └── Response line 2 (child)
  └── Code block (child)
User's next message (top-level)
```

### Multi-Agent Conversations

Multiple agents can participate in the same conversation:

```
Explain this code

**Qwen 🤖:**
   This function does X, Y, Z...

Can you verify that?

**Claude 🤖:**
   Yes, Qwen's analysis is correct...
```

### Tool Calling

Agents can use tools registered by SyncHub. For example, the GitHub plugin registers:

- `issues_find` - Search issues by query
- `issues_list` - List issues with filters
- `search_workspace` - Full-text search across Thymer
- `get_active_record` - Get current page content

Tools work across all providers (Anthropic, OpenAI, Ollama with tool support).

### Auto-Title Generation

When chatting on an untitled page, AgentHub suggests a title based on the conversation:

```
[AgentHub] Setting title: DateTime Delay Drama
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Agent name (displayed in responses) |
| `command` | text | Command shortcut (e.g., `@claude`) |
| `enabled` | choice | Yes/No - whether agent appears in command palette |
| `provider` | choice | Anthropic, OpenAI, Ollama, Custom |
| `model` | choice | Model selection per provider |
| `system_prompt` | text | Custom instructions for this agent |
| `custom_model` | text | Model ID for Custom provider |
| `custom_endpoint` | text | API endpoint URL |
| `token` | text | API key (agent-specific) |
| `status` | choice | Idle, Thinking, Error (read-only) |
| `last_run` | datetime | When agent last responded |
| `invocations` | number | Total conversation count |
| `last_error` | text | Most recent error |

## System Prompt Layering

Agents use a layered system prompt:

1. **Base prompt** (AgentHub): Explains context format, `[[GUID]]` linking, formatting rules
2. **Custom prompt** (your field): Agent-specific personality or instructions

Example custom prompt:
```
You are a code review expert. Focus on:
- Security vulnerabilities
- Performance issues
- Code style consistency
```

## Keyboard Workflow (Future)

Currently: Type → Cmd+K → Select agent → Enter

Planned (needs Thymer hotkey support): Type → Ctrl+Enter → Agent responds

## Troubleshooting

### Agent Not Appearing in Command Palette

- Check `enabled` is set to `Yes`
- Reload the page (agents load on page load)

### "No API key configured"

- Set the `token` field on the agent record
- Or set a shared token in SyncHub's agenthub config

### Tool Calls Not Working

- Check SyncHub is loaded (`window.syncHub` exists)
- Check tools are registered (console: `[SyncHub] Registered N tools`)
- Some models (small Ollama) don't support tools well

### 502 Errors with Custom Endpoint

- Check your local server is running
- MLX can crash on rapid requests - add delay between calls
- Check model fits in VRAM

### `[object Object]` in Responses

- This was a bug with ref segment handling - update to latest plugin code

## Architecture

```javascript
// AgentHub waits for SyncHub
window.addEventListener('synchub-ready', () => this.initialize());

// On chat invoke:
1. parseChatPage()     → Extract messages + linked content
2. buildMessages()     → Prepend context, replace [[GUID]] with titles
3. callLLMStreaming()  → Route to provider, handle tool calls
4. StreamingRenderer   → Progressive markdown rendering
5. suggestTitle()      → Auto-title if untitled page
```

## Related

- [SyncHub](../synchub/) - The orchestrator AgentHub depends on
- [Chats Collection](../collections/chats/) - Dedicated collection for AI conversations
- [Issues Collection](../collections/issues/) - Example of tool-enabled collection
