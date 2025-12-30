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

### Config JSON

```json
{
    "repos": ["owner/repo1", "owner/repo2"],
    "query": "is:open assignee:@me"
}
```

- **repos**: List of repositories to sync (format: `owner/repo`)
- **query**: GitHub search query (optional, for advanced filtering)

You can use either `repos`, `query`, or both.

### Example Configs

Sync specific repos:
```json
{"repos": ["facebook/react", "vercel/next.js"]}
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

| Issues Field | GitHub Field |
|-------------|--------------|
| external_id | `github_{id}` |
| title | title |
| source | "GitHub" |
| repo | `{owner}/{repo}` |
| number | number |
| type | "Issue" or "PR" |
| state | "Open" or "Closed" |
| author | user.login |
| assignee | assignee.login |
| url | html_url |
| body | body (as markdown content) |

## Manual Sync

Trigger a sync from the browser console:

```javascript
window.syncHub.requestSync('github-sync')
```
