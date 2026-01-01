# AgentHub: AI Agents That Live in Your Thymer Space

**Chat with AI on any page. Bring context via links. Use multiple models.**

---

## Your Pages, Your Agents, Your Context

AgentHub turns Thymer into an AI-native workspace. Instead of switching to a separate chat app, talk to AI assistants right where your work lives.

Link to any page. The agent sees everything. Ask questions. Get answers inline.

```
How do [[Project Roadmap]] and [[Q1 Goals]] align?

**Claude 🤖:**
   Based on the linked documents, here are the key alignments...
```

---

## Features

### Chat Anywhere
Open any page. Type your question. Invoke an agent. Response appears inline, nested under the agent marker. Your conversation becomes part of the page.

### Context via Links
Use `[[Page Name]]` to bring any page into the conversation. AgentHub resolves the link, fetches the content, and gives the AI full context. No copy-pasting. No context windows to manage.

### Multi-Agent Conversations
Different agents for different tasks. Ask Qwen for a quick summary, then have Claude verify it. Each agent's response is clearly marked. They can even build on each other's answers.

### Tool Calling
Agents can search your data and take action. Each collection has its own tools:

- **Issues** — "what are my open bugs?", "show PRs assigned to me"
- **Captures** — "find highlights about productivity", "recent Readwise captures"
- **Calendar** — "what's on my calendar today?", "events needing follow-up"
- **People** — "who at Acme Corp?", "who am I overdue to contact?"
- **Workspace** — full-text search across everything

### Multiple Providers
- **Anthropic** — Claude Sonnet, Haiku, Opus
- **OpenAI** — GPT-4o, GPT-4o-mini
- **Ollama** — Run local models
- **Custom** — Any OpenAI-compatible endpoint (MLX, vLLM, etc.)

### Auto-Titles
Start chatting on an untitled page. AgentHub generates a title based on your conversation. Your Chats collection stays organized without effort.

---

## The Smart Laundromat

AgentHub extends the Thymer Sync Hub architecture:

```
    ┌─────────────────────────────────────────────┐
    │               AGENT HUB                     │
    │          (the AI operators)                 │
    │   ┌──────┐ ┌──────┐ ┌──────┐              │
    │   │Claude│ │ Qwen │ │Llama │              │
    │   └──────┘ └──────┘ └──────┘              │
    │              │ uses tools                  │
    ├──────────────┼─────────────────────────────┤
    │              ▼                             │
    │           SYNC HUB                         │
    │      (the orchestrator)                    │
    │                                            │
    │   GitHub → Issues                          │
    │   Readwise → Captures                      │
    │   Calendar → Events                        │
    └─────────────────────────────────────────────┘
```

**Same baskets. Different machines. Smart operators.**

Sync plugins bring data in. Agents help you work with it.

---

## Quick Start

1. Install SyncHub (the orchestrator)
2. Install AgentHub collection + plugin
3. Create an agent with your API key
4. Open any page → Cmd+K → "Chat with [Agent]"

That's it. You're chatting with AI in your workspace.

---

## What Makes It Different

| Traditional AI Chat | AgentHub |
|---------------------|----------|
| Separate app | Right in your workspace |
| Copy-paste context | Link to pages |
| One conversation | Chat on any page |
| One model | Multiple providers |
| Generic responses | Access to your data via tools |

---

## Perfect For

- **Research** — Link sources, ask questions, get synthesis
- **Planning** — Connect goals to roadmaps, find gaps
- **Code Review** — Link PRs and issues, get analysis
- **Writing** — Bring in notes, get drafts and feedback
- **Daily Work** — Quick answers from your own data

---

## Open Source

AgentHub is part of [Thymer Sync Hub](https://github.com/riclib/thymer-synchub), the open plugin ecosystem for Thymer.

Build your own agents. Connect your own models. Extend with your own tools.

---

*AI that lives where you work. Not the other way around.*
