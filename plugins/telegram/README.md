# Telegram Sync Plugin

Send messages to your personal Telegram bot, and they appear in Thymer - automatically routed to the right place.

## Setup

### 1. Create Your Bot

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow the prompts to name your bot
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Configure in Sync Hub

| Field | Value |
|-------|-------|
| Plugin ID | `telegram-sync` |
| Enabled | Yes |
| Interval | 1 minute (default) |
| Token | Your bot token from BotFather |

## Smart Routing

Messages are automatically routed based on content:

| You Send | Destination |
|----------|-------------|
| `Quick thought` | Journal: **01:23** Quick thought |
| Multi-line text | Journal with indented children |
| `# Markdown heading` | Captures collection (with Journal ref) |
| `https://article.com` | Captures collection (URL stored) |
| `github.com/user/repo/issues/42` | Journal (future: Issues collection) |
| Photo + caption | Journal: **01:23** [Photo] caption |

### Multi-line Messages

```
First line
Second line
Third line
```

Becomes a Journal entry with children:
- **01:23** First line
  - Second line
  - Third line

### Markdown Documents

Messages starting with `#` are saved to Captures:

```
# Meeting Notes
## Attendees
- Alice
- Bob
```

## How It Works

```
Phone → Telegram Bot → [messages queue - stored 24h]
                              ↓
                    Sync Hub polls getUpdates
                              ↓
                    Smart routing → Journal / Captures / Issues
```

No server needed! Telegram stores messages for 24 hours. The plugin polls when Thymer is open.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `token` | Yes | Bot token from BotFather |
| `config` | Auto | `{"last_offset": 12345}` - tracks processed messages |

The `last_offset` is automatically updated after each sync.

## Command Palette

- **Telegram Sync** - Poll for new messages

## Troubleshooting

### "Not configured"

Make sure the Token field has your bot token from BotFather.

### Messages not appearing

- Check the bot token is correct
- Try sending a test message to your bot
- Check Sync Hub logs for errors

### Duplicate messages

The `last_offset` tracks processed messages. If corrupted, you might see duplicates. Fix by removing `last_offset` from config.

## Future Features

- [ ] Web URL fetching with readability extraction
- [ ] GitHub issue/PR detection → Issues collection
- [ ] iCal link parsing → Calendar collection
- [ ] Photo storage → Captures with embedded image
- [ ] Voice message transcription
- [ ] `/task` command for creating tasks
- [ ] Two-way: notifications from Thymer → Telegram
