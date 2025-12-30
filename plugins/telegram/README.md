# Telegram Sync

Send messages to your personal Telegram bot, and they appear in Thymer - automatically routed to the right place.

## Setup

### 1. Create Your Bot

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow the prompts to name your bot
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Configure in Sync Hub

1. Open Thymer
2. Go to **Sync Hub** collection
3. Find the **Telegram** record (or create one with `plugin_id` = `telegram-sync`)
4. Paste this into the `config` field:

```json
{
  "bot_token": "YOUR_BOT_TOKEN_HERE"
}
```

5. Set `enabled` to `Yes`

### 3. Start Messaging!

Send messages to your bot on Telegram. They'll sync to Thymer based on the content type.

## Smart Routing

| You Send | It Goes To |
|----------|------------|
| `Quick thought` | Journal: **01:23** Quick thought |
| `First line`<br>`Second line`<br>`Third line` | Journal: **01:23** First line (with indented children) |
| `# Meeting Notes`<br>`## Attendees`<br>`- Alice` | Captures collection (with ref in Journal) |
| `https://article.com/good-read` | Captures collection (URL stored) |
| `github.com/user/repo/issues/42` | Journal (future: Issues collection) |
| Photo + caption | Journal: **01:23** [Photo] caption |

## Sync Interval

Default: Every 1 minute

Messages are stored by Telegram for 24 hours, so they won't be lost if Thymer isn't open.

## How It Works

```
Phone → Telegram Bot → [messages queue - stored 24h]
                              ↓
                    Sync Hub polls getUpdates
                              ↓
                    Smart routing → Journal / Captures / Issues / Calendar
```

No server needed! Telegram stores the messages, the plugin polls when you have Thymer open.

## Config Options

```json
{
  "bot_token": "YOUR_TOKEN",
  "last_offset": 12345678
}
```

- `bot_token` - Your bot token from BotFather (required)
- `last_offset` - Auto-managed, tracks which messages have been processed

## Troubleshooting

### "Not configured"
Make sure the config field has valid JSON with `bot_token`.

### Messages not appearing
- Check the bot token is correct
- Try sending a test message to your bot
- Check Sync Hub logs for errors

### Duplicate messages
The `last_offset` tracks processed messages. If it gets corrupted, you might see duplicates. Reset by removing `last_offset` from config.

## Future Features

- [ ] Web URL fetching with readability extraction
- [ ] GitHub issue/PR detection → Issues collection
- [ ] iCal link parsing → Calendar collection
- [ ] Photo storage → Captures with embedded image
- [ ] Voice message transcription
- [ ] `/task` command for creating tasks
- [ ] Two-way: notifications from Thymer → Telegram
