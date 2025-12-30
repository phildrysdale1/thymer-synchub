/**
 * Template Sync Plugin
 *
 * Copy this folder and customize for your source.
 *
 * Replace:
 * - PLUGIN_ID: unique identifier (e.g., 'my-source-sync')
 * - PLUGIN_NAME: display name (e.g., 'My Source')
 * - PLUGIN_ICON: Tabler icon class (e.g., 'ti-brand-github')
 * - TARGET_COLLECTION: collection to write to (e.g., 'Issues')
 */

class Plugin extends AppPlugin {

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async onLoad() {
        this.log('Template Sync loading...');
        this.waitForSyncHub();
    }

    onUnload() {
        if (window.syncHub) {
            window.syncHub.unregister('PLUGIN_ID');
        }
        this.log('Template Sync unloaded.');
    }

    waitForSyncHub() {
        if (window.syncHub) {
            this.registerWithSyncHub();
        } else {
            setTimeout(() => this.waitForSyncHub(), 1000);
            this.log('Waiting for Sync Hub...');
        }
    }

    async registerWithSyncHub() {
        await window.syncHub.register({
            id: 'PLUGIN_ID',
            name: 'PLUGIN_NAME',
            icon: 'PLUGIN_ICON',
            defaultInterval: '5m',
            sync: async (ctx) => this.sync(ctx),
        });

        this.log('Registered with Sync Hub');
    }

    // =========================================================================
    // Sync Logic
    // =========================================================================

    async sync({ data, ui, log, debug }) {
        // 1. Get config from Sync Hub record
        const collections = await data.getAllCollections();
        const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');

        if (!syncHubCollection) {
            log('Sync Hub collection not found');
            return { summary: 'Sync Hub not found', created: 0, updated: 0 };
        }

        const syncHubRecords = await syncHubCollection.getAllRecords();
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'PLUGIN_ID');

        if (!myRecord) {
            log('Plugin record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        const token = myRecord.text('token');
        const configJson = myRecord.text('config');

        if (!token) {
            log('No token configured');
            return { summary: 'No token', created: 0, updated: 0 };
        }

        // Parse config
        let config = {};
        try {
            config = configJson ? JSON.parse(configJson) : {};
        } catch (e) {
            log('Invalid config JSON, using defaults');
        }

        // 2. Find target collection
        const targetCollection = collections.find(c => c.getName() === 'TARGET_COLLECTION');

        if (!targetCollection) {
            log('Target collection not found');
            return { summary: 'Collection not found', created: 0, updated: 0 };
        }

        // 3. Fetch from source
        const items = await this.fetchFromSource(token, config, { log, debug });

        // 4. Process items
        const result = await this.processItems(items, targetCollection, data, { log, debug });

        // 5. Return summary
        const summary = result.created > 0 || result.updated > 0
            ? `${result.created} new, ${result.updated} updated`
            : 'No changes';

        return {
            summary,
            created: result.created,
            updated: result.updated,
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
        // return await response.json();

        log('fetchFromSource not implemented');
        return [];
    }

    // =========================================================================
    // Record Processing
    // =========================================================================

    async processItems(items, targetCollection, data, { log, debug }) {
        let created = 0;
        let updated = 0;

        const existingRecords = await targetCollection.getAllRecords();

        for (const item of items) {
            // Generate unique external ID for this source
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
                }
            } else {
                await this.createRecord(targetCollection, recordData);
                created++;
                debug(`Created: ${recordData.title}`);
            }
        }

        return { created, updated };
    }

    mapItemToRecord(item, externalId) {
        // TODO: Map your source fields to collection fields
        return {
            external_id: externalId,
            title: item.title || item.name || 'Untitled',
            source: 'PLUGIN_NAME',  // Use LABEL, not ID
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
            console.warn(`[Template] Could not get record: ${recordGuid}`);
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
        this.setField(record, 'created_at', new Date(data.created_at));
        this.setField(record, 'updated_at', new Date(data.updated_at));
    }

    setField(record, fieldId, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return;

            if (typeof value === 'string') {
                // setChoice matches by LABEL, not ID
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

    // =========================================================================
    // Logging
    // =========================================================================

    log(message, level = 'info') {
        const prefix = '[Template]';  // Change to your plugin name
        if (level === 'error') {
            console.error(prefix, message);
        } else {
            console.log(prefix, message);
        }
    }
}
