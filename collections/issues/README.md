# Issues Collection

Issues and pull requests from any source - GitHub, GitLab, Jira, Linear, etc.

## Populated By

| Plugin | What It Syncs |
|--------|---------------|
| [GitHub](../../plugins/github/) | Issues and PRs from GitHub repos |
| GitLab (planned) | Issues and MRs |
| Jira (planned) | Issues and tasks |
| Linear (planned) | Issues |

## Fields

### Synced Fields (Read-Only)

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Issue/PR title |
| `external_id` | text | Deduplication key (e.g., `github_123`) |
| `source` | choice | GitHub, GitLab, Linear, Jira |
| `repo` | text | Repository name (e.g., `owner/repo`) |
| `project` | choice | Project grouping (configured per plugin) |
| `number` | number | Issue/PR number |
| `type` | choice | Issue, PR, Task, Bug, Feature |
| `author` | text | Creator username |
| `assignee` | text | Assigned username |
| `url` | url | Link to issue |
| `created_at` | datetime | When created |
| `updated_at` | datetime | Last modified |

### Workflow Fields (Editable)

| Field | Type | Options |
|-------|------|---------|
| `state` | choice | Open, Next, In Progress, Closed, Cancelled |

The `state` field can be customized for your workflow.

## Views

| View | Type | Description |
|------|------|-------------|
| **By Status** | Board | Grouped by state (Open/In Progress/Closed) |
| **By Source** | Board | Grouped by source (GitHub/GitLab/etc) |
| **By Project** | Board | Grouped by project |
| **All Issues** | Table | Full list with all fields |

## Project Grouping

The `project` field lets you group repos into logical projects. Configure in the GitHub plugin:

```json
{
  "projects": {
    "owner/repo-1": "My Project",
    "owner/repo-2": "My Project"
  }
}
```

Issues from both repos appear under "My Project" in the By Project view.

## Adding Project Options

To add new project options, edit this collection's schema and add choices to the `project` field. The label must match what's in your plugin config.
