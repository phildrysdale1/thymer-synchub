# Telegram Sync Plugin

Send messages to your personal Telegram bot, and they appear in Thymer - automatically routed to the right place.

---

## The following features have been added in this version to the original
### Timestamps
- Use proper Thymer datetime segments (interactive/clickable time values)
- Timezone calculated from browser (accurate local time)
- Tasks don't show timestamps (cleaner appearance)

### Multi-line Messages
- First line with timestamp, subsequent lines as bulleted children
- Lines after tasks become bulleted sub-items
- Proper ulist type for bullets

### Task Creation
- Lines starting with [] or TASK create checkbox tasks
@important flags tasks as important
-  Multiple task lines each become separate tasks (no bullets)

### Date Parsing
- Automatic date detection: @tomorrow, @today, @Jan 15, 2026-01-15, 15/01
- @ prefix removes date text, keeps date segment (clean)
- Dates work on all lines (tasks, regular text, bullets)

### Hashtags
- #tag creates clickable, searchable hashtags
- Works in tasks, text, and bullets
- Supports hyphens: #project-alpha, #Q1-planning

---

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

### "No sync function for: telegram-sync"

The Sync Hub record exists but the plugin's sync function isn't registered. Check:

1. **Plugin enabled?** Go to Plugins panel → ensure Telegram is enabled (not just installed)

2. **Check console for registration:**
   ```
   [SyncHub] Registered plugin: telegram-sync (N total)
   ```
   If missing, the plugin never registered.

3. **Check load order:** Look for these messages in order:
   ```
   [SyncHub] Ready, dispatching synchub-ready event
   [SyncHub] Registered plugin: telegram-sync
   ```

4. **JavaScript errors?** Red errors during load prevent registration.

5. **Force re-registration:** In console:
   ```javascript
   window.dispatchEvent(new CustomEvent('synchub-ready'))
   ```

6. **Reload the plugin:** Disable → wait → re-enable

7. **Orphaned record?** If plugin was uninstalled, delete the "Telegram" record from Sync Hub collection, then reinstall.

## Future Features

- [ ] Web URL fetching with readability extraction
- [ ] GitHub issue/PR detection → Issues collection
- [ ] iCal link parsing → Calendar collection
- [ ] Photo storage → Captures with embedded image
- [ ] Voice message transcription
- [ ] `/task` command for creating tasks
- [ ] Two-way: notifications from Thymer → Telegram
