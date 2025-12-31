/**
 * Template Sync Plugin
 *
 * Copy this folder and customize for your source.
 *
 * Replace:
 * - PLUGIN_ID: unique identifier (e.g., 'my-source-sync')
 * - PLUGIN_NAME: display name (e.g., 'My Source')
 * - PLUGIN_ICON: Tabler icon name without ti- prefix (e.g., 'brand-github')
 * - TARGET_COLLECTION: collection to write to (e.g., 'Issues', 'Captures')
 */

class Plugin extends AppPlugin {

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async onLoad() {
        // Command palette: Manual sync
        this.syncCommand = this.ui.addCommandPaletteCommand({
            label: 'PLUGIN_NAME Sync',
            icon: 'PLUGIN_ICON',
            onSelected: () => this.triggerSync()
        });

        // Listen for Sync Hub ready event (handles reloads)
        this.syncHubReadyHandler = () => this.registerWithSyncHub();
        window.addEventListener('synchub-ready', this.syncHubReadyHandler);

        // Also check if Sync Hub is already ready
        if (window.syncHub) {
            this.registerWithSyncHub();
        }
    }

    onUnload() {
        if (this.syncCommand) {
            this.syncCommand.remove();
        }
        if (this.syncHubReadyHandler) {
            window.removeEventListener('synchub-ready', this.syncHubReadyHandler);
        }
        if (window.syncHub) {
            window.syncHub.unregister('PLUGIN_ID');
        }
    }

    async triggerSync() {
        if (window.syncHub) {
            await window.syncHub.requestSync('PLUGIN_ID');
        }
    }

    async registerWithSyncHub() {
        console.log('[PLUGIN_NAME] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'PLUGIN_ID',
            name: 'PLUGIN_NAME',
            icon: 'ti-PLUGIN_ICON',
            defaultInterval: '5m',
            sync: async (ctx) => this.sync(ctx),
        });
        console.log('[PLUGIN_NAME] Registered successfully');
    }

    // =========================================================================
    // Sync Logic
    // =========================================================================

    async sync({ data, ui, log, debug }) {
        // log() = shown in journal at Info level (use for errors only)
        // debug() = shown only at Debug level (use for routine messages)

        // 1. Get config from Sync Hub record
        const collections = await data.getAllCollections();
        const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');

        if (!syncHubCollection) {
            log('Sync Hub collection not found');
            return { summary: 'Sync Hub not found', created: 0, updated: 0, changes: [] };
        }

        const syncHubRecords = await syncHubCollection.getAllRecords();
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'PLUGIN_ID');

        if (!myRecord) {
            debug('Plugin record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        const token = myRecord.text('token');
        const configJson = myRecord.text('config');

        if (!token) {
            debug('No token configured');
            return { summary: 'No token', created: 0, updated: 0, changes: [] };
        }

        // Parse config
        let config = {};
        try {
            config = configJson ? JSON.parse(configJson) : {};
        } catch (e) {
            debug('Invalid config JSON, using defaults');
        }

        // 2. Find target collection
        const targetCollection = collections.find(c => c.getName() === 'TARGET_COLLECTION');

        if (!targetCollection) {
            log('Target collection not found');
            return { summary: 'Collection not found', created: 0, updated: 0, changes: [] };
        }

        // 3. Fetch from source
        debug('Fetching from source...');
        const items = await this.fetchFromSource(token, config, { log, debug });

        if (items.length === 0) {
            return { summary: 'No new items', created: 0, updated: 0, changes: [] };
        }

        debug(`Found ${items.length} item(s)`);

        // 4. Process items
        const result = await this.processItems(items, targetCollection, data, { log, debug });

        // 5. Return summary with changes for journal logging
        const summary = result.created > 0 || result.updated > 0
            ? `${result.created} new, ${result.updated} updated`
            : 'No changes';

        return {
            summary,
            created: result.created,
            updated: result.updated,
            changes: result.changes,  // Array of { verb, title, guid, major }
        };
    }

    // =========================================================================
    // Source API - CUSTOMIZE THIS
    // =========================================================================

    async fetchFromSource(token, config, { log, debug }) {
        // TODO: Implement API call to your source
        //
        // Example:
        // const response = await fetch('https://api.example.com/items', {
        //     headers: { 'Authorization': `Bearer ${token}` },
        // });
        // if (!response.ok) {
        //     log(`API error: ${response.status}`);
        //     return [];
        // }
        // return await response.json();

        debug('fetchFromSource not implemented');
        return [];
    }

    // =========================================================================
    // Record Processing
    // =========================================================================

    async processItems(items, targetCollection, data, { log, debug }) {
        let created = 0;
        let updated = 0;
        const changes = [];

        const existingRecords = await targetCollection.getAllRecords();

        for (const item of items) {
            // Generate unique external ID for deduplication
            const externalId = `PLUGIN_ID_${item.id}`;
            const existingRecord = existingRecords.find(r => r.text('external_id') === externalId);

            // Map source fields to collection fields
            const recordData = this.mapItemToRecord(item, externalId);

            if (existingRecord) {
                // Check if needs update (compare timestamps, etc.)
                const currentUpdatedAt = existingRecord.text('updated_at');
                if (currentUpdatedAt !== item.updated_at) {
                    this.updateRecord(existingRecord, recordData);
                    updated++;
                    debug(`Updated: ${recordData.title}`);
                    changes.push({
                        verb: 'updated',
                        title: null,  // null = just show the record ref
                        guid: existingRecord.guid,
                        major: false
                    });
                }
            } else {
                const record = await this.createRecord(targetCollection, recordData);
                if (record) {
                    created++;
                    debug(`Created: ${recordData.title}`);
                    changes.push({
                        verb: 'created',
                        title: null,
                        guid: record.guid,
                        major: true
                    });
                }
            }
        }

        return { created, updated, changes };
    }

    mapItemToRecord(item, externalId) {
        // TODO: Map your source fields to collection fields
        return {
            external_id: externalId,
            title: item.title || item.name || 'Untitled',
            source: 'PLUGIN_NAME',  // For choice fields, use LABEL not ID
            // Add more field mappings...
            created_at: item.created_at,
            updated_at: item.updated_at,
        };
    }

    // =========================================================================
    // Record Management
    // =========================================================================

    async createRecord(collection, recordData) {
        const recordGuid = collection.createRecord(recordData.title);
        if (!recordGuid) return null;

        // Wait for record to sync (SDK quirk)
        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await collection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) {
            console.warn(`[PLUGIN_NAME] Could not get record: ${recordGuid}`);
            return null;
        }

        this.setRecordFields(record, recordData);
        return record;
    }

    updateRecord(record, recordData) {
        this.setRecordFields(record, recordData);
    }

    setRecordFields(record, data) {
        this.setField(record, 'external_id', data.external_id);
        this.setField(record, 'source', data.source);
        // Add more fields...

        // For datetime fields, use DateTime class
        if (data.created_at) {
            this.setDateTimeField(record, 'created_at', data.created_at);
        }
        if (data.updated_at) {
            this.setDateTimeField(record, 'updated_at', data.updated_at);
        }
    }

    setField(record, fieldId, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return;

            if (typeof value === 'string') {
                // For choice fields, setChoice matches by LABEL not ID
                if (typeof prop.setChoice === 'function') {
                    const success = prop.setChoice(value);
                    if (!success) {
                        prop.set(value);
                    }
                } else {
                    prop.set(value);
                }
            } else {
                prop.set(value);
            }
        } catch (e) {
            // Field doesn't exist or can't be set
        }
    }

    setDateTimeField(record, fieldId, dateValue) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return;

            // DateTime class is available globally in Thymer
            if (typeof DateTime !== 'undefined') {
                const dt = new DateTime(new Date(dateValue));
                prop.set(dt.value());
            }
        } catch (e) {
            // Field doesn't exist or DateTime not available
        }
    }

    // =========================================================================
    // Journal Helpers (optional - for multi-collection plugins)
    // =========================================================================

    async getTodayJournalRecord(data) {
        try {
            const collections = await data.getAllCollections();
            const journalCollection = collections.find(c => c.getName() === 'Journal');
            if (!journalCollection) return null;

            const records = await journalCollection.getAllRecords();

            // Journal guids end with date in YYYYMMDD format
            // Thymer uses previous day's journal until ~3am
            const now = new Date();
            const today = now.toISOString().slice(0, 10).replace(/-/g, '');

            let journal = records.find(r => r.guid.endsWith(today));
            if (journal) return journal;

            // Fallback: yesterday (for late-night sessions)
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

            return records.find(r => r.guid.endsWith(yesterdayStr)) || null;
        } catch (e) {
            return null;
        }
    }

    async appendToJournal(journalRecord, timeStr, text) {
        const existingItems = await journalRecord.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === journalRecord.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const newItem = await journalRecord.createLineItem(null, lastItem, 'text');
        if (newItem) {
            newItem.setSegments([
                { type: 'bold', text: timeStr },
                { type: 'text', text: ' ' + text }
            ]);
        }
    }

    async addRefToJournal(journalRecord, timeStr, verb, targetGuid) {
        const existingItems = await journalRecord.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === journalRecord.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const newItem = await journalRecord.createLineItem(null, lastItem, 'text');
        if (newItem) {
            newItem.setSegments([
                { type: 'bold', text: timeStr },
                { type: 'text', text: ` ${verb} ` },
                { type: 'ref', text: { guid: targetGuid } }
            ]);
        }
    }
}
