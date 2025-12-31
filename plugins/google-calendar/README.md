# Google Calendar Sync Plugin

Syncs events from Google Calendar into the Calendar collection.

## Setup

### 1. Connect via Command Palette

The easiest way to connect:

1. Open Command Palette (Cmd+K)
2. Run "Connect Google Calendar"
3. Complete OAuth in popup window
4. Token is saved automatically

This uses the shared auth endpoint at `thymerhelper.lifelog.my`.

### Alternative: Custom Auth Endpoint

If you need your own OAuth endpoint:

1. Deploy [thymer-auth](https://github.com/riclib/thymer-auth)
2. Set config: `{"auth_url": "https://your-endpoint/google?service=calendar"}`
3. Run "Connect Google Calendar"

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `config` | Optional | `{"auth_url": "..."}` for custom endpoint |
| `token` | Auto | Set by OAuth flow: `{"refresh_token": "...", "token_endpoint": "..."}` |

## Field Mappings

| Calendar Field | Google Calendar Source | Notes |
|----------------|------------------------|-------|
| `title` | summary | Event title |
| `external_id` | `gcal_{id}` | For deduplication |
| `source` | "Google Calendar" | |
| `period` | start/end | DateTime range |
| `calendar` | calendarId | Primary, Work, etc. |
| `status` | status | Confirmed/Tentative |
| `location` | location | |
| `attendees` | attendees[0..4] | First 5 attendees |
| `meet_link` | conferenceData | Google Meet URL |
| `url` | htmlLink | Link to event |
| `created_at` | created | |
| `updated_at` | updated | |
| (content) | description | As markdown |

### All-Day Events

All-day events are synced with date-only values (no time). Multi-day events show as a date range.

## Sync Behavior

| Mode | Past | Future |
|------|------|--------|
| Incremental | 7 days | 30 days |
| Full sync | 30 days | 90 days |

- **Recurring events**: Expanded into individual instances
- **Deduplication**: Uses `external_id` to match existing records
- **Cancellations**: Cancelled events are skipped

## Command Palette

- **Connect Google Calendar** - Start OAuth flow
- **Google Calendar Full Sync** - Past 30 days + future 90 days
- **Google Calendar Sync** - Incremental sync

## Calendar Collection Views

- **Calendar** - Month/week calendar view
- **Upcoming** - Table with prep tracking
- **By Calendar** - Board grouped by calendar
- **By Source** - Board grouped by sync source
- **Review** - Track meeting energy and outcomes

## Privacy

Your calendar data flows directly from Google to your browser. The auth helper only handles OAuth token refresh - it never sees your calendar data.

## Troubleshooting

### "Not configured"

Make sure the plugin record exists in Sync Hub with `plugin_id` = `google-calendar-sync`.

### "Auth failed"

Token may have expired. Run "Connect Google Calendar" to reconnect.

### Events not appearing

- Check the Calendar collection exists
- Check sync is running (look for journal entries)
- Try a Full Sync from Command Palette
