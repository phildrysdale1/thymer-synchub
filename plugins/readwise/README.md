# Readwise Sync Plugin

Syncs documents and highlights from Readwise Reader into the Readwise collection.

## Setup

### 1. Get Readwise Access Token

1. Go to [Readwise Access Token](https://readwise.io/access_token)
2. Copy your token

### 2. Configure in Sync Hub

Create a record in your Sync Hub collection:

| Field | Value |
|-------|-------|
| Plugin ID | `readwise-sync` |
| Enabled | Yes |
| Interval | 1 hour (or your preference) |
| Token | Your Readwise access token |

## How It Works

- Fetches all documents (books, articles, podcasts, etc.) from Readwise Reader
- Groups highlights by their parent document
- Creates one record per document in the Readwise collection
- Inserts highlights as markdown in the document body
- Supports incremental sync using `updatedAfter` parameter

## Field Mappings

| Readwise Field | Thymer Field |
|----------------|--------------|
| id | external_id (prefixed with `readwise_`) |
| title | title |
| author | author |
| category | category (Article, Book, Podcast, etc.) |
| source_url | source_url |
| url | url (Readwise Reader URL) |
| highlights count | highlight_count |

## Document Body

Each document record contains:

```markdown
## Summary

[LLM-generated summary if available]

## Highlights

> First highlight text here

**Note:** Your annotation if any

> Second highlight text here
```

## Manual Sync

Use command palette (Cmd+K):
- **Readwise Full Sync** - fetches all documents
- **Readwise Incremental Sync** - fetches only changes since last sync

Or via console:
```javascript
window.syncHub.requestSync('readwise-sync')
```

## Rate Limiting

The plugin automatically handles Readwise's rate limiting (429 responses) by waiting and retrying.
