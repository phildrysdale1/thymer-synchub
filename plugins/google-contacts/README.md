# Google Contacts Sync Plugin

Syncs contacts from Google to the People collection.

## Prerequisites

**Important:** Google Contacts API requires RESTRICTED scope verification. You must deploy your own OAuth endpoint using [thymer-self-auth](https://github.com/niclib/thymer-self-auth).

### 1. Enable Google People API

1. Go to [Google Cloud Console](https://console.developers.google.com)
2. Select or create a project
3. Enable the [People API](https://console.developers.google.com/apis/api/people.googleapis.com)

### 2. Deploy thymer-self-auth

Since Contacts uses a RESTRICTED scope (`contacts.readonly`), you need your own OAuth endpoint:

1. Clone [thymer-self-auth](https://github.com/riclib/thymer-self-auth)
2. Deploy to Cloudflare Workers (or similar)
3. Configure with your Google OAuth credentials
4. Note your endpoint URL

## Configuration

In the Sync Hub collection, set these fields on the Google Contacts record:

| Field | Required | Description |
|-------|----------|-------------|
| `config` | Yes | `{"auth_url": "https://your-endpoint/google?service=contacts"}` |
| `token` | Auto | Set automatically by OAuth flow |

### Config Format

```json
{
  "auth_url": "https://your-worker.workers.dev/google?service=contacts"
}
```

## Setup Flow

1. Set the `config` field with your auth_url
2. Run "Connect Google Contacts" from Command Palette
3. Complete OAuth in popup window
4. Token is saved automatically
5. Initial sync runs automatically

## Field Mappings

| People Field | Google Contacts Source | Notes |
|--------------|------------------------|-------|
| `title` | names[0].displayName | Primary name |
| `external_id` | `gcontacts_{resourceName}` | For deduplication |
| `source` | "Google" | |
| `email` | emailAddresses[0].value | Primary email |
| `phone` | phoneNumbers[0].value | Primary phone |
| `organization` | organizations[0].name | Company |
| `job_title` | organizations[0].title | Role |
| `notes` | biographies[0].value | Contact notes |
| `anniversary` | events[type=anniversary] | If available |
| `created_at` | Sync timestamp | When first synced |
| `updated_at` | metadata.sources[0].updateTime | Google's update time |

### User-Editable Fields

These fields are for your own tracking and not overwritten by sync:

| Field | Purpose |
|-------|---------|
| `keep_in_touch` | Weekly, Monthly, Quarterly, Yearly, Never |
| `last_contact` | When you last contacted this person |

## Sync Behavior

- **Incremental sync**: Compares `updated_at` to detect changes
- **Full sync**: Re-processes all contacts
- **Deduplication**: Uses `external_id` to match existing records
- **Skip unnamed**: Contacts without a name are skipped

## Command Palette

- **Connect Google Contacts** - Start OAuth flow
- **Google Contacts Full Sync** - Re-sync all contacts
- **Google Contacts Sync** - Incremental sync

## API Details

**Endpoint:** `https://people.googleapis.com/v1/people/me/connections`

**Fields requested:**
- names
- emailAddresses
- phoneNumbers
- organizations
- events
- biographies
- metadata

**Pagination:** Fetches up to 1000 contacts per page, handles nextPageToken automatically.

## Troubleshooting

### 403 "People API not enabled"

Enable the People API in your Google Cloud Console project.

### "Invalid token" errors

1. Check that your thymer-self-auth worker is running
2. Try "Connect Google Contacts" again to re-authenticate

### Contacts not syncing

- Only contacts with names are synced
- Check the console for debug messages (set Log Level to Debug)
