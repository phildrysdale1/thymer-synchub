# Calendar Collection

Calendar events from any source - with meeting prep tracking, review tools, and a turquoise meeting countdown.

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
| `all_day` | choice | Yes/No - Whether it's an all-day event |
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
| `prep` | choice | Yes/No | Preparation complete |
| `energy` | choice | High, Medium, Low | Energy level required/spent |
| `outcome` | choice | Productive, Neutral, Waste | Meeting outcome |
| `followup` | choice | Yes/No | Needs follow-up action |

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

## Meeting Status Bar

The Calendar collection adds a turquoise meeting countdown to Thymer's status bar:

```
📅 in 2h      → More than 2 hours away
📅 in 45m     → Less than 2 hours (shows minutes)
📅 in 12m     → Less than 30 minutes (text turns turquoise - urgent!)
📅 next 30m   → Meeting is ongoing (shows time remaining)
```

**Click the icon** to see a popup with:
- Meeting title
- Time and location
- "Join Meeting" button (extracts link from `meet_link` or `location`)

The countdown updates every minute and only shows timed events (not all-day).

## MCP Tools

When connected via thymer-bar, these tools are available to AI assistants:

| Tool | Description |
|------|-------------|
| `calendar_today` | Get today's events with rich date/time info |
| `calendar_upcoming` | Get events in the next N days (default: 7) |
| `calendar_find` | Find events by calendar or status |
| `calendar_search` | Search events by title or location |
| `calendar_needs_followup` | Get events marked for follow-up |

### Example: Claude checking your schedule

```
User: What's on my calendar today?

Claude: [calls calendar_today]
        You have 3 events today:
        - Team standup at 9:00 (in 45m)
        - Design review at 14:00
        - 1:1 with Alex at 16:00
```

### Rich Date Format

The MCP tools return Thymer's native date format for timezone accuracy:

```json
{
  "title": "Team Meeting",
  "when": {
    "date": "2026-01-04",
    "time": "17:00",
    "end_time": "18:00",
    "all_day": false
  }
}
```
