# Building a Sync Hub Plugin

You are helping build a Thymer Sync Hub plugin. This document contains the patterns and gotchas learned from building the existing plugins.

## Getting Started

Clone the Sync Hub repository to get the template and existing plugins:

```bash
git clone https://github.com/riclib/thymer-synchub.git
cd thymer-synchub/plugins/_template
```

For the official Thymer Plugin SDK and type definitions:

```bash
git clone https://github.com/thymerapp/thymer-plugin-sdk.git
```

## Background Reading

The Sync Hub was built iteratively, documented in the "Becoming Lifelog" series:

- [The Ouroboros Update](https://lifelog.my/riclib/posts/the-ouroboros-update) - The origin story
- [Collections All The Way Down](https://lifelog.my/riclib/posts/collections-all-the-way-down-the-native-dividend) - Why collections matter
- [The Laundromat](https://lifelog.my/riclib/posts/the-laundromat) - The architecture metaphor
- [The First Wash](https://lifelog.my/riclib/posts/the-first-wash) - GitHub sync implementation
- [The Second Load](https://lifelog.my/riclib/posts/the-second-load) - Readwise and rate limits
- [The OAuth Tango](https://lifelog.my/riclib/posts/the-oauth-tango) - Google Calendar OAuth flow
- [The Checkbox That Wanted More](https://lifelog.my/riclib/posts/the-checkbox-that-wanted-more) - Status bar, Telegram, and late-night fixes

## Plugin Structure

Each plugin is a folder with:
- `plugin.js` - The plugin code (AppPlugin class)
- `plugin.json` - Metadata (name, icon, description)

## Key Patterns

### 1. Registration with Sync Hub

Use the `synchub-ready` event, NOT polling:

```javascript
async onLoad() {
    // Listen for Sync Hub ready event
    this.syncHubReadyHandler = () => this.registerWithSyncHub();
    window.addEventListener('synchub-ready', this.syncHubReadyHandler);

    // Also check if already ready
    if (window.syncHub) {
        this.registerWithSyncHub();
    }
}

onUnload() {
    window.removeEventListener('synchub-ready', this.syncHubReadyHandler);
    window.syncHub?.unregister('my-plugin-id');
}
```

### 2. Logging: log() vs debug()

- `log(msg)` - Shown in journal at Info level. Use ONLY for errors.
- `debug(msg)` - Shown only at Debug level. Use for routine messages.

```javascript
// WRONG - spams journal
if (!token) {
    log('No token configured');
    return { summary: 'No token' };
}

// RIGHT - silent at Info level
if (!token) {
    debug('No token configured');
    return { summary: 'No token' };
}
```

### 3. Return Changes Array

For proper journal logging, return a `changes` array:

```javascript
return {
    summary: '3 new items',
    created: 3,
    updated: 0,
    changes: [
        { verb: 'created', title: null, guid: recordGuid, major: true },
        // title: null = just show [Record Name]
        // title: '"content" to' = show "content" to [Record]
    ]
};
```

### 4. Deduplication with external_id

Always use `external_id` to prevent duplicates:

```javascript
const externalId = `myplugin_${item.id}`;
const existing = records.find(r => r.text('external_id') === externalId);
if (existing) {
    debug('Already exists');
    return { verb: 'skipped', title: null, guid: existing.guid };
}
```

### 5. DateTime Fields

Use the global `DateTime` class:

```javascript
if (typeof DateTime !== 'undefined') {
    const dt = new DateTime(new Date(dateString));
    record.prop('captured_at')?.set(dt.value());
}
```

### 6. Choice Fields

`setChoice()` matches by LABEL, not ID:

```javascript
// If choice options are: [{id: 'gh', label: 'GitHub'}, ...]
record.prop('source')?.setChoice('GitHub');  // Use label!
```

### 7. Journal Access

Journal GUIDs end with date (YYYYMMDD). Use fallback for late-night sessions:

```javascript
async getTodayJournalRecord(data) {
    const journalCollection = collections.find(c => c.getName() === 'Journal');
    const records = await journalCollection.getAllRecords();

    // Try today
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let journal = records.find(r => r.guid.endsWith(today));
    if (journal) return journal;

    // Fallback: yesterday (Thymer uses prev day until ~3am)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
    return records.find(r => r.guid.endsWith(yesterdayStr));
}
```

### 8. Adding References to Journal

```javascript
async addRefToJournal(journalRecord, timeStr, verb, targetGuid) {
    const items = await journalRecord.getLineItems();
    const topLevel = items.filter(i => i.parent_guid === journalRecord.guid);
    const lastItem = topLevel[topLevel.length - 1] || null;

    const newItem = await journalRecord.createLineItem(null, lastItem, 'text');
    newItem?.setSegments([
        { type: 'bold', text: timeStr },
        { type: 'text', text: ` ${verb} ` },
        { type: 'ref', text: { guid: targetGuid } }
    ]);
}
```

### 9. CORS Workaround for Web Fetching

Browser blocks cross-origin requests. Use a proxy fallback:

```javascript
async fetchPage(url) {
    let html;
    try {
        const res = await fetch(url);
        if (res.ok) html = await res.text();
    } catch (e) {
        // CORS blocked - use proxy
    }

    if (!html) {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        html = await fetch(proxyUrl).then(r => r.text());
    }
    return html;
}
```

### 10. Record Creation (SDK Quirk)

After `createRecord()`, wait before accessing the record:

```javascript
const guid = collection.createRecord(title);
await new Promise(r => setTimeout(r, 50));  // SDK quirk
const records = await collection.getAllRecords();
const record = records.find(r => r.guid === guid);
```

## Plugin Configuration

Plugins store config in Sync Hub collection:
- `token` field - API tokens/secrets
- `config` field - JSON for additional settings

```javascript
const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'my-plugin');
const token = myRecord.text('token');
const config = JSON.parse(myRecord.text('config') || '{}');
```

## Multi-Collection Plugins

For plugins that route to multiple collections (like Telegram):

1. Detect content type (URL, markdown, one-liner, etc.)
2. Route to appropriate collection
3. Return changes with correct verb/title format:
   - To Captures: `{ verb: 'captured', title: null, guid: captureGuid }`
   - To Journal: `{ verb: 'noted', title: '"content" to', guid: journalGuid }`

## Testing

1. Set Log Level to "Debug" in Sync Hub record
2. Check browser console for `[PluginName]` messages
3. Check Sync Hub record body for activity log

## Common Gotchas

1. **Polling for Sync Hub** - Use `synchub-ready` event instead
2. **Noisy logs** - Use `debug()` not `log()` for routine messages
3. **Duplicates** - Always check `external_id` before creating
4. **Journal not found** - Check yesterday's journal for late-night sessions
5. **CORS errors** - Use allorigins.win proxy as fallback
6. **Choice fields** - Use label not ID with `setChoice()`
7. **DateTime fields** - Use `DateTime` class, not raw dates
