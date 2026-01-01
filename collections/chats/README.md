# Chats Collection

Dedicated pages for AI conversations. While you can chat with agents on any page, the Chats collection provides a home for dedicated AI conversations.

## Purpose

Use the Chats collection when you want:
- A dedicated space for AI conversations
- To organize conversations by topic
- To find past conversations easily
- Auto-generated titles for your chats

For quick inline questions, chat directly on any page. For deeper conversations, create a Chat.

## Created By

| Source | How |
|--------|-----|
| Manual | Create a new page in Chats collection |
| AgentHub | Auto-creates when chatting on untitled pages |

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Conversation title (auto-suggested if untitled) |
| `agents` | text (many) | Which agents participated (read-only) |
| `created_at` | datetime | When conversation started |
| `banner` | banner | Optional header image |

## Page Structure

```
Properties
├── Title: DateTime Delay Drama
├── Agents: Qwen, Claude
└── Created: Jan 1 23:24

how do [[When Thymer Learned to Tell Time]] and [[The Lizard Brain]] relate?

**Qwen 🤖:**
   The two linked records are distinct parts of a narrative...
   1. Becoming Life log...
   2. The Lizard Brain vs The Caffeinated Squirrel...

can you verify that?

**Claude 🤖:**
   Yes, Qwen's analysis is correct...
```

## Views

| View | Type | Description |
|------|------|-------------|
| **All Chats** | Table | All conversations, newest first |

## Workflow

1. **Start a chat**: Create new page in Chats, or type on any untitled page
2. **Link context**: Use `[[Page Name]]` to bring in relevant records
3. **Invoke agent**: Cmd+K → "Chat with [Agent]"
4. **Continue**: Agent responds nested under its marker, you type at root level
5. **Multi-agent**: Invoke different agents for different perspectives

## Auto-Title

When you chat on an untitled page (or one named "Untitled Chat" / "New Chat"), AgentHub automatically:
1. Completes the conversation
2. Generates a 3-5 word title based on the content
3. Sets it on the page

This keeps your Chats collection organized without manual naming.

## Tips

- **Link liberally**: The more context you provide via links, the better responses
- **Multi-agent**: Use different agents for different tasks (Qwen for speed, Claude for depth)
- **Keep conversations focused**: One topic per chat for easier retrieval
- **Use Properties panel**: See which agents participated and when

## Related

- [AgentHub](../../agenthub/) - The AI agent system
- [SyncHub](../../synchub/) - The orchestrator providing tools and markdown parsing
