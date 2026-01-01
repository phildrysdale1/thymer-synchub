# AgentHub Collection

AI agents that live in your Thymer space. Chat with them on their page, bring context in via links.

## How It Works

1. Create an agent with a name and @command
2. Write the system prompt in a toggle at the top of the page
3. Chat below - your messages and agent responses
4. Link to other pages to bring context into the conversation

## Agent Page Structure

```
> System Prompt (toggle - collapsed by default)
  You are a research assistant. Be thorough, cite sources...

Me: What do you think about [[Interesting Article]]?

Agent: Based on the linked article, I see three key points...

Me: Expand on point 2

Agent: ...
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Agent name |
| `command` | text | @command to invoke (e.g., `@research`) |
| `model` | choice | Claude Sonnet, Haiku, or Opus |
| `status` | choice | Active, Paused, Draft |
| `api_key` | text | Optional per-agent API key |
| `last_invoked` | datetime | When last used |
| `invocations` | number | Usage counter |

## Invoking an Agent

From anywhere in Thymer:
- Type the @command (e.g., `@research`)
- Or use command palette: "Chat with [Agent Name]"

The agent page opens and the conversation continues.

## Bringing in Context

Link to any page to include it in context:
- `[[Page Name]]` - includes page content
- `[[Page Name#Section]]` - includes specific section

The agent sees the linked content when processing your message.

## System Prompt Tips

Keep it in a toggle at the top to stay out of the way. Include:
- Personality and tone
- What the agent is good at
- How it should format responses
- Any constraints or guidelines
