# Calendar Collection

Calendar events from any source - with meeting prep and review tracking.

## Populated By

| Plugin | What It Syncs |
|--------|---------------|
| [Google Calendar](../../plugins/google-calendar/) | Events from Google Calendar |
| Outlook (planned) | Events from Microsoft 365 |
| iCal (planned) | Any iCal/ICS feed |

## Fields

### Synced Fields (Read-Only)

| Field | Type | Description |
|-------|------|-------------|
| `title` | text | Event title |
| `external_id` | text | Deduplication key (e.g., `gcal_abc123`) |
| `source` | choice | Google, Outlook, Proton, iCal, Manual |
| `time_period` | datetime | Event start/end time |
| `url` | url | Link to original event |
| `all_day` | checkbox | Whether it's an all-day event |
| `updated_at` | text | Last sync update |

### Event Details (Editable)

| Field | Type | Options | Description |
|-------|------|---------|-------------|
| `calendar` | choice | Primary, Work, Personal, Family | Which calendar |
| `status` | choice | Confirmed, Tentative, Cancelled | Event status |
| `location` | text | - | Event location |
| `attendees` | text | - | Attendee names |
| `meet_link` | url | - | Video conference URL |

### Meeting Tracking (Editable)

| Field | Type | Options | Description |
|-------|------|---------|-------------|
| `prep` | checkbox | - | Preparation complete |
| `energy` | choice | High, Medium, Low | Energy level required/spent |
| `outcome` | choice | Productive, Neutral, Waste | Meeting outcome |
| `followup` | checkbox | - | Needs follow-up action |

## Views

| View | Type | Description |
|------|------|-------------|
| **Calendar** | Calendar | Month/week calendar view |
| **Upcoming** | Table | Events with prep tracking |
| **By Calendar** | Board | Grouped by calendar |
| **By Source** | Board | Grouped by sync source |
| **Review** | Table | Track energy and outcomes |

## Meeting Workflow

### Before the Meeting

1. Check the **Upcoming** view for today's events
2. Mark `prep` checkbox when ready
3. Click `meet_link` to join

### After the Meeting

1. Open the **Review** view
2. Set `energy` - how draining was it?
3. Set `outcome` - was it productive?
4. Check `followup` if action items exist

## Calendar Options

To add new calendars (e.g., "Holidays"), edit the collection schema and add choices to the `calendar` field. The plugin maps Google Calendar names to these options.

## Adding Events Manually

Create a record with `source` set to "Manual". Set the `time_period` for when the event occurs. Synced events won't overwrite manual entries (different `external_id`).

## Energy Tracking

Use the `energy` and `outcome` fields to understand your meeting patterns:

- **High energy + Waste** = Meetings to decline or shorten
- **Low energy + Productive** = Efficient meetings to protect
- **High energy + Productive** = Important but costly - schedule carefully
