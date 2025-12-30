# Google Calendar Sync

Syncs events from Google Calendar into your Calendar collection with proper time range support.

## Setup

### 1. Connect Your Google Account

Visit the auth helper to connect your Google Calendar:

**[Connect Google Calendar](https://thymerhelper.lifelog.my/google?service=calendar)**

After approving access, you'll get a config JSON to copy.

### 2. Configure in Sync Hub

1. Open Thymer
2. Go to **Sync Hub** collection
3. Find the **Google Calendar** record
4. Paste the config JSON into the `config` field
5. Set `enabled` to true

### 3. Sync!

The plugin will sync automatically based on the interval (default: 15 minutes).

You can also trigger a manual sync from the command palette:
- `Google Calendar Sync` - Incremental sync
- `Google Calendar Full Sync` - Full sync (past 30 days, future 90 days)

## What Gets Synced

- Event title
- Time period with full range support (start + end as DateTime range)
- All-day events (displayed without time, multi-day as range)
- Event status (Confirmed/Tentative)
- Location
- Attendees (first 5)
- Google Meet link (from conferenceData)
- Event URL
- Event description (as document content)

## Calendar Collection Views

- **Calendar** - Month/week calendar view
- **Upcoming** - Table of events with prep tracking
- **By Calendar** - Board grouped by calendar (Primary/Work/Personal)
- **By Source** - Board grouped by sync source (Google/Outlook/etc)
- **Review** - Track meeting energy and outcomes

## Sync Window

- **Incremental sync**: Past 7 days + future 30 days
- **Full sync**: Past 30 days + future 90 days

Recurring events are expanded into individual instances.

## Privacy

Your calendar data flows directly from Google to your browser. The auth helper only handles OAuth token refresh - it never sees your calendar data.

## Config Format

```json
{
  "refresh_token": "your-refresh-token",
  "token_endpoint": "https://thymer-auth.workers.dev/refresh"
}
```

## Troubleshooting

### "Not configured"
The plugin can't find its config. Make sure:
- The Sync Hub record has `plugin_id` set to `google-calendar-sync`
- The `config` field contains valid JSON with `refresh_token` and `token_endpoint`

### "Auth failed"
The refresh token may have expired. Visit the auth helper to reconnect:
[Connect Google Calendar](https://thymerhelper.lifelog.my/google?service=calendar)

### Events not appearing
- Check the Calendar collection exists
- Check the sync is actually running (look for journal entries)
- Try a Full Sync from the command palette
