# The Laundromat Architecture

## Philosophy

> "Same baskets. Different machines."

The Sync Hub architecture separates **what** you're storing from **where** it comes from.

### The Problem

Without this architecture, you'd need:
- GitHub Issues Collection + sync code
- GitLab Issues Collection + sync code
- Jira Issues Collection + sync code
- Linear Issues Collection + sync code
- ...

**N sources × M fields × schema maintenance = PAIN**

### The Solution

With the Laundromat:
- Issues Collection (ONE schema)
- GitHub Sync Plugin (just the API part)
- GitLab Sync Plugin (just the API part)
- ...

**1 schema + N small plugins = JOY**

## Components

### Sync Hub (The Building)

A **CollectionPlugin** that:
- Exposes `window.syncHub` API for plugins to register
- Stores plugin configs (tokens, intervals, etc.) as records
- Schedules and executes syncs
- Provides shared utilities (markdown insertion, etc.)

### Collections (The Baskets)

Source-agnostic "real world objects":

| Collection | Contains | Examples |
|------------|----------|----------|
| Issues | Tasks, bugs, PRs | GitHub issues, Jira tickets, Linear tasks |
| Captures | Notes, highlights | Readwise highlights, web clips, bookmarks |
| Events | Calendar items | Google Calendar, Outlook, meeting notes |

### Sync Plugins (The Washing Machines)

**AppPlugins** that:
- Register with Sync Hub on load
- Know how to talk to ONE external API
- Output clean, source-agnostic records

## Data Flow

```
GitHub API                           Thymer
    │                                  │
    │  ┌─────────────────────┐        │
    ▼  │   GitHub Sync       │        │
 issues──▶  Plugin          ──────────▶ Issues Collection
    │  │   (washing machine) │        │    (clean basket)
    │  └─────────────────────┘        │
    │                                  │
```

1. Plugin fetches from GitHub API
2. Transforms GitHub-specific data to generic Issue schema
3. Creates/updates records in Issues collection

## The Peace Pipe

This architecture reconciles two productivity camps:

**PKM People Want:**
- Captures (highlights, notes)
- Connections between ideas
- Knowledge building

**GTD People Want:**
- Issues (tasks, projects)
- Events (calendar)
- Action management

**With the Laundromat:**

Both get what they want. Same baskets, different machines. Use Notion? Fine. Use Todoist? Fine. Use GitHub Issues? Fine. All data ends up in the same clean, unified collections.
