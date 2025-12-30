# Creating Sync Plugins

This guide walks you through creating a new sync plugin for Thymer Sync Hub.

## Overview

A sync plugin is a Thymer **Global Plugin** (AppPlugin) that:
1. Registers with Sync Hub on load
2. Provides a `sync()` function that fetches data from an external source
3. Writes clean, source-agnostic records to a collection

## Step 1: Copy the Template

```bash
cp -r plugins/_template plugins/my-source
```

## Step 2: Update plugin.json

```json
{
    "name": "My Source Sync",
    "icon": "ti-cloud-download",
    "description": "Syncs data from My Source into Thymer"
}
```

## Step 3: Implement the Plugin

### Registration

```javascript
class Plugin extends AppPlugin {
    async onLoad() {
        this.waitForSyncHub();
    }

    waitForSyncHub() {
        if (window.syncHub) {
            this.registerWithSyncHub();
        } else {
            setTimeout(() => this.waitForSyncHub(), 1000);
        }
    }

    async registerWithSyncHub() {
        await window.syncHub.register({
            id: 'my-source-sync',        // Unique ID
            name: 'My Source',           // Display name
            icon: 'ti-cloud-download',   // Tabler icon
            defaultInterval: '5m',       // Default sync interval
            sync: async (ctx) => this.sync(ctx),
        });
    }
}
```

### The Sync Function

```javascript
async sync({ data, ui, log, debug }) {
    // 1. Get your config from Sync Hub record
    const collections = await data.getAllCollections();
    const syncHub = collections.find(c => c.getName() === 'Sync Hub');
    const records = await syncHub.getAllRecords();
    const myRecord = records.find(r => r.text('plugin_id') === 'my-source-sync');

    const token = myRecord.text('token');
    const config = JSON.parse(myRecord.text('config') || '{}');

    // 2. Fetch from your source
    const items = await this.fetchFromSource(token, config);

    // 3. Find the target collection
    const targetCollection = collections.find(c => c.getName() === 'Issues');

    // 4. Process items
    let created = 0, updated = 0;
    for (const item of items) {
        // Check if exists, create or update
        // ...
        created++;
    }

    // 5. Return summary
    return {
        summary: `${created} new, ${updated} updated`,
        created,
        updated,
    };
}
```

### Creating Records

```javascript
async createRecord(collection, itemData) {
    const recordGuid = collection.createRecord(itemData.title);
    if (!recordGuid) return null;

    // IMPORTANT: Wait for record to sync before accessing it
    await new Promise(resolve => setTimeout(resolve, 50));
    const records = await collection.getAllRecords();
    const record = records.find(r => r.guid === recordGuid);

    if (!record) return null;

    // Set fields
    this.setField(record, 'external_id', itemData.external_id);
    this.setField(record, 'source', 'My Source');  // Use LABEL, not ID
    this.setField(record, 'url', itemData.url);
    // ...

    return record;
}

setField(record, fieldId, value) {
    try {
        const prop = record.prop(fieldId);
        if (!prop) return;

        if (typeof value === 'string') {
            // setChoice matches by LABEL, not ID
            if (typeof prop.setChoice === 'function') {
                const success = prop.setChoice(value);
                if (!success) prop.set(value);
            } else {
                prop.set(value);
            }
        } else {
            prop.set(value);
        }
    } catch (e) {
        // Skip silently
    }
}
```

## Step 4: Add to a Collection

If your source maps to an existing collection (Issues, Captures, Events), you're done.

If you need a new collection type:
1. Create the collection schema in `collections/my-type/collection.json`
2. Add the source choice to the `source` field

## Step 5: Test

1. Create a Global Plugin in Thymer
2. Paste your plugin.json and plugin.js
3. Create a record in Sync Hub with your plugin_id
4. Trigger sync: `window.syncHub.requestSync('my-source-sync')`

## Common Gotchas

See [docs/sdk-notes.md](docs/sdk-notes.md) for SDK quirks and workarounds.

### Key Points

- `setChoice()` matches by **label**, not ID
- `data.getRecord(guid)` returns null immediately after creation - use the 50ms workaround
- Choice field values must match labels exactly: `'GitHub'` not `'github'`
- Always check if prop exists before setting: `record.prop('field')?.set(value)`
