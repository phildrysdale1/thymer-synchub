# Readwise Sync Plugin

Syncs documents and highlights from Readwise Reader into the Captures collection.

## Setup

### 1. Get Readwise Access Token

1. Go to [Readwise Access Token](https://readwise.io/access_token)
2. Copy your token

### 2. Configure in Sync Hub

| Field | Value |
|-------|-------|
| Plugin ID | `readwise-sync` |
| Enabled | Yes |
| Interval | 1 hour (recommended) |
| Token | Your Readwise access token |

## Field Mappings

| Captures Field | Readwise Source | Notes |
|----------------|-----------------|-------|
| `title` | title | Document title |
| `external_id` | `readwise_{id}` | For deduplication |
| `source` | "Readwise" | |
| `author` | author | |
| `category` | category | Article, Book, Podcast, etc. |
| `source_url` | source_url | Original URL |
| `url` | url | Readwise Reader URL |
| `highlight_count` | highlights.length | Number of highlights |
| (content) | highlights + summary | As markdown |

## Document Content

Each synced document contains:

```markdown
## Summary

[AI-generated summary if available]

## Highlights

> First highlight text

**Note:** Your annotation

> Second highlight text
```

## Sync Behavior

- **Incremental sync**: Uses `updatedAfter` to fetch only changes
- **Full sync**: Re-fetches all documents
- **Deduplication**: Uses `external_id` to match existing records
- **Grouping**: Highlights are grouped by parent document

## Command Palette

- **Readwise Full Sync** - Fetch all documents
- **Readwise Incremental Sync** - Only changes since last sync

## Manual Sync

```javascript
window.syncHub.requestSync('readwise-sync')
```

## Rate Limiting

The plugin automatically handles Readwise's rate limiting (429 responses) by waiting and retrying.

## API Details

**Endpoints:**
- `GET /api/v3/list/` - Fetch documents
- `GET /api/v3/highlights/` - Fetch highlights

**Pagination:** Handles `nextPageCursor` automatically.
