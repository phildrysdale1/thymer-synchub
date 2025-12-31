# People Collection

Contacts and relationships - your personal CRM.

## Populated By

| Plugin | What It Syncs |
|--------|---------------|
| [Google Contacts](../../plugins/google-contacts/) | Contacts from Google |
| Gmail (planned) | Contacts from email interactions |

## Fields

### Synced Fields (Read-Only)

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Person's name |
| `external_id` | text | Deduplication key (e.g., `gcontacts_people/c123`) |
| `source` | choice | Google, LinkedIn, Manual |
| `email` | text | Primary email |
| `phone` | text | Primary phone |
| `organization` | text | Company name |
| `job_title` | text | Role at organization |
| `notes` | text | Contact notes (from source) |
| `anniversary` | datetime | Anniversary date |
| `created_at` | datetime | When first synced |
| `updated_at` | datetime | Last sync update |

### Personal CRM Fields (Editable)

| Field | Type | Options | Description |
|-------|------|---------|-------------|
| `keep_in_touch` | choice | Weekly, Monthly, Quarterly, Yearly, Never | How often to reach out |
| `last_contact` | datetime | - | When you last contacted them |

## Views

| View | Type | Description |
|------|------|-------------|
| **All People** | Table | Full contact list |
| **Keep in Touch** | Board | Grouped by contact frequency |
| **By Source** | Board | Grouped by sync source |

## CRM Workflow

Use the `keep_in_touch` and `last_contact` fields to track relationships:

1. Set `keep_in_touch` to your desired frequency
2. After contacting someone, update `last_contact`
3. Use the Keep in Touch board to see who's due for outreach

## Adding Contacts Manually

Create a record with `source` set to "Manual". Synced contacts won't overwrite manual entries (different `external_id`).

## Notes Field

The `notes` field syncs from Google Contacts biographies. You can also add your own notes - they won't be overwritten if the source notes are empty.
