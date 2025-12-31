# Captures Collection

Highlights, notes, and bookmarks from any source - your personal knowledge base.

## Populated By

| Plugin | What It Syncs |
|--------|---------------|
| [Readwise](../../plugins/readwise/) | Documents and highlights from Readwise Reader |
| [Telegram](../../plugins/telegram/) | Markdown documents sent to your bot |
| Kindle (planned) | Book highlights |
| Instapaper (planned) | Saved articles |

## Fields

### Synced Fields (Read-Only)

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Capture title |
| `external_id` | text | Deduplication key (e.g., `readwise_123`) |
| `source` | choice | Readwise, Kindle, Web, Manual |
| `content` | text | Full content or highlight text |
| `source_title` | text | Original document/book title |
| `source_author` | text | Author name |
| `source_url` | url | Link to original source |
| `highlight_count` | number | Number of highlights in document |
| `captured_at` | datetime | When captured |
| `created_at` | datetime | When first synced |
| `updated_at` | datetime | Last sync update |

### Personal Fields (Editable)

| Field | Type | Description |
|-------|------|-------------|
| `tags` | text | Your tags for organization |
| `banner` | banner | Custom banner image |
| `icon` | text | Custom icon |

## Views

| View | Type | Description |
|------|------|-------------|
| **By Source** | Board | Grouped by sync source |
| **All Captures** | Table | Full list sorted by capture date |

## Content Structure

### Readwise Documents

Synced documents include:

```markdown
## Summary

[AI-generated summary if available]

## Highlights

> First highlight text

**Note:** Your annotation

> Second highlight text
```

### Telegram Captures

Messages starting with `#` create Captures:

```markdown
# Meeting Notes
## Attendees
- Alice
- Bob
```

## Adding Captures Manually

Create a record with `source` set to "Manual". Use the page body for your content.

## Tagging Strategy

The `tags` field supports free-text tagging. Suggested patterns:

- Topic tags: `#productivity #programming`
- Status tags: `#to-review #processed`
- Project tags: `#project-x`
