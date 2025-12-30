# GitLab Sync Plugin

**Status: Planned**

Syncs issues and merge requests from GitLab into the Issues collection.

## Planned Features

- Sync issues from projects
- Sync merge requests
- Support for self-hosted GitLab instances
- Group-level sync

## Config Format (Planned)

```json
{
    "projects": ["namespace/project1", "namespace/project2"],
    "instance": "https://gitlab.com",
    "query": "state=opened&assignee_id=@me"
}
```

## Contributing

Want to implement this? Copy `plugins/_template/` and start coding!
