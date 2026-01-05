# GitHub Sync Plugin

Syncs issues and pull requests from GitHub into the Issues collection.

## Setup

### 1. Create GitHub Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Generate a new token (classic) with `repo` scope
3. Copy the token

### 2. Configure in Sync Hub

Create a record in your Sync Hub collection:

| Field | Value |
|-------|-------|
| Plugin ID | `github-sync` |
| Enabled | Yes |
| Interval | 5 min (or your preference) |
| Token | Your GitHub personal access token |
| Config | See below |

## Config JSON

### Projects Mapping (Recommended)

Map repositories to project labels for grouping:

```json
{
  "projects": {
    "owner/repo": "Project Label",
    "owner/another-repo": "Project Label"
  }
}
```

**Example:**
```json
{
  "projects": {
    "riclib/thymer-synchub": "Thymer Plugins",
    "riclib/thymer-auth": "Thymer Plugins",
    "riclib/v4": "V4"
  }
}
```

This syncs issues from all three repos. Issues from `thymer-synchub` and `thymer-auth` are grouped under "Thymer Plugins" project in the "By Project" board view.

### Simple Repos List

If you don't need project grouping:

```json
{
  "repos": ["owner/repo1", "owner/repo2"]
}
```

### Search Query

Use GitHub search syntax for advanced filtering:

```json
{
  "query": "is:open assignee:@me"
}
```

You can combine with projects:

```json
{
  "projects": {"myorg/myrepo": "Work"},
  "query": "org:myorg is:open"
}
```

### Example Configs

Sync specific repos with project grouping:
```json
{
  "projects": {
    "facebook/react": "React Ecosystem",
    "vercel/next.js": "React Ecosystem"
  }
}
```

Sync issues assigned to you:
```json
{"query": "is:open assignee:@me"}
```

Sync your organization's issues:
```json
{"query": "org:my-org is:open"}
```

## Field Mappings

| Issues Field | GitHub Field | Notes |
|--------------|--------------|-------|
| `external_id` | `github_{id}` | For deduplication |
| `title` | title | |
| `source` | "GitHub" | |
| `repo` | `owner/repo` | Actual repository |
| `project` | From config mapping | For grouping repos |
| `number` | number | |
| `type` | "Issue" or "PR" | |
| `external_state` | "Open" or "Closed" | Read-only, always synced from GitHub |
| `status` | "Inbox" (for new) | Your workflow status, never overwritten |
| `author` | user.login | |
| `assignee` | assignee.login | |
| `url` | html_url | |
| `created_at` | created_at | |
| `updated_at` | updated_at | |
| (content) | body | Inserted as markdown |

## Two-Field Design

The plugin uses separate fields for GitHub state and your workflow:

| Field | Purpose | Synced? |
|-------|---------|---------|
| `external_state` | GitHub's state (Open/Closed) | ✅ Always updated |
| `status` | Your workflow (Inbox → Next → Doing → Done) | ❌ Never touched after creation |

**Benefits:**
- No conflict between sync and your workflow
- You control your kanban board completely
- New issues land in "Inbox" for triage
- `external_state` shows if GitHub closed/reopened

**Default workflow statuses:**
- **Inbox** - New issues land here for triage
- **Backlog** - Acknowledged, not yet prioritized
- **Next** - Ready to work on
- **Doing** - Currently in progress
- **Done** - Completed
- **Cancelled** - Won't do

## Sync Behavior

- **Incremental sync**: Only fetches issues updated since last sync
- **Full sync**: Re-fetches all issues, updates project field on existing issues
- **Deduplication**: Uses `external_id` to match existing records
- **Concurrency**: Uses sync locks to prevent duplicate syncs across multiple Thymer tabs/windows

## Command Palette

- **GitHub Full Sync** - Ignores last_run, re-syncs everything
- **GitHub Incremental Sync** - Only syncs changes since last run

## Manual Sync

Trigger a sync from the browser console:

```javascript
window.syncHub.requestSync('github-sync')
```

## Rate Limits

GitHub API allows 5,000 requests/hour with authentication. Each repo sync uses 1 request per 100 issues.
