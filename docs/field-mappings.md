# Field Mappings

How to map source-specific fields to collection schemas.

## Issues Collection

| Collection Field | Type | GitHub | GitLab | Jira | Linear |
|-----------------|------|--------|--------|------|--------|
| external_id | text | `github_{id}` | `gitlab_{id}` | `jira_{key}` | `linear_{id}` |
| title | text | title | title | summary | title |
| source | choice | "GitHub" | "GitLab" | "Jira" | "Linear" |
| repo | text | `{owner}/{repo}` | `{namespace}/{project}` | project.key | team.key |
| number | number | number | iid | - | number |
| type | choice | issue/PR | issue/MR | story/bug/task | issue/bug/feature |
| state | choice | open/closed | opened/closed | to do/in progress/done | todo/in progress/done |
| author | text | user.login | author.username | reporter.displayName | creator.name |
| assignee | text | assignee.login | assignee.username | assignee.displayName | assignee.name |
| url | url | html_url | web_url | self link | url |
| created_at | datetime | created_at | created_at | created | createdAt |
| updated_at | datetime | updated_at | updated_at | updated | updatedAt |

### State Mapping

Map source states to our simplified states:

```javascript
// GitHub
const state = issue.state === 'open' ? 'Open' : 'Closed';

// Jira
const stateMap = {
    'To Do': 'Open',
    'In Progress': 'In Progress',
    'Done': 'Closed',
};
const state = stateMap[issue.fields.status.name] || 'Open';

// Linear
const stateMap = {
    'todo': 'Open',
    'inProgress': 'In Progress',
    'done': 'Closed',
    'canceled': 'Closed',
};
```

### Type Mapping

```javascript
// GitHub
const type = issue.pull_request ? 'PR' : 'Issue';

// Jira
const typeMap = {
    'Story': 'Task',
    'Bug': 'Bug',
    'Task': 'Task',
    'Epic': 'Feature',
};

// Linear
const typeMap = {
    'issue': 'Issue',
    'bug': 'Bug',
    'feature': 'Feature',
};
```

## Captures Collection (Future)

| Collection Field | Type | Readwise | Web Clip | Kindle |
|-----------------|------|----------|----------|--------|
| external_id | text | `rw_{id}` | `clip_{hash}` | `kindle_{id}` |
| content | text | text | selection | highlight |
| source | choice | "Readwise" | "Web" | "Kindle" |
| source_title | text | book.title | page.title | book.title |
| source_author | text | book.author | - | book.author |
| source_url | url | - | page.url | - |
| captured_at | datetime | highlighted_at | created_at | created_at |

## Events Collection (Future)

| Collection Field | Type | Google Cal | Outlook | Proton |
|-----------------|------|------------|---------|--------|
| external_id | text | `gcal_{id}` | `outlook_{id}` | `proton_{id}` |
| title | text | summary | subject | summary |
| source | choice | "Google" | "Outlook" | "Proton" |
| start | datetime | start.dateTime | start.dateTime | start |
| end | datetime | end.dateTime | end.dateTime | end |
| all_day | checkbox | start.date exists | isAllDay | - |
| location | text | location | location | location |
| attendees | text | attendees[].email | attendees[].email | - |
| url | url | htmlLink | webLink | - |

## Adding a New Source

1. Identify which collection your source maps to
2. Create the field mapping table
3. Implement the transforms in your sync function
4. Add the source choice to the collection schema if needed
