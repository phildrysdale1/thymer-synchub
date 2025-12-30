/**
 * Google Calendar Sync - App Plugin
 *
 * Syncs events from Google Calendar into the Events collection.
 * Uses thymer-auth worker for OAuth token refresh.
 *
 * Config format (from thymer-auth):
 * {
 *   "refresh_token": "...",
 *   "token_endpoint": "https://thymer-auth.workers.dev/refresh"
 * }
 */

class Plugin extends AppPlugin {

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async onLoad() {
        // Command palette: Full Sync
        this.fullSyncCommand = this.ui.addCommandPaletteCommand({
            label: 'Google Calendar Full Sync',
            icon: 'calendar',
            onSelected: () => this.triggerSync(true)
        });

        // Command palette: Incremental Sync
        this.incrementalSyncCommand = this.ui.addCommandPaletteCommand({
            label: 'Google Calendar Sync',
            icon: 'calendar',
            onSelected: () => this.triggerSync(false)
        });

        this.waitForSyncHub();
    }

    onUnload() {
        if (this.fullSyncCommand) {
            this.fullSyncCommand.remove();
        }
        if (this.incrementalSyncCommand) {
            this.incrementalSyncCommand.remove();
        }
        if (window.syncHub) {
            window.syncHub.unregister('google-calendar-sync');
        }
    }

    async triggerSync(forceFullSync = false) {
        this.forceFullSync = forceFullSync;
        if (window.syncHub) {
            await window.syncHub.requestSync('google-calendar-sync');
        }
        this.forceFullSync = false;
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
            id: 'google-calendar-sync',
            name: 'Google Calendar',
            icon: 'ti-calendar',
            defaultInterval: '15m',
            sync: async (ctx) => this.sync(ctx),
        });
    }

    // =========================================================================
    // Sync Logic
    // =========================================================================

    async sync({ data, ui, log, debug }) {
        // Get config from Sync Hub record
        const collections = await data.getAllCollections();
        const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');

        if (!syncHubCollection) {
            log('Sync Hub collection not found');
            return { summary: 'Sync Hub not found', created: 0, updated: 0, changes: [] };
        }

        const syncHubRecords = await syncHubCollection.getAllRecords();
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'google-calendar-sync');

        if (!myRecord) {
            log('Google Calendar record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        // Config contains refresh_token and token_endpoint
        const configJson = myRecord.text('config');
        const lastRun = myRecord.prop('last_run')?.date();

        if (!configJson) {
            log('No config - visit thymer-auth to connect Google Calendar');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        let config;
        try {
            config = JSON.parse(configJson);
        } catch (e) {
            log('Invalid config JSON');
            return { summary: 'Invalid config', created: 0, updated: 0, changes: [] };
        }

        if (!config.refresh_token || !config.token_endpoint) {
            log('Config missing refresh_token or token_endpoint');
            return { summary: 'Invalid config', created: 0, updated: 0, changes: [] };
        }

        // Get fresh access token from thymer-auth
        let accessToken;
        try {
            accessToken = await this.getAccessToken(config, { log, debug });
        } catch (e) {
            log(`Token refresh failed: ${e.message}`);
            return { summary: 'Auth failed', created: 0, updated: 0, changes: [] };
        }

        // Find Events collection
        const eventsCollection = collections.find(c => c.getName() === 'Events');

        if (!eventsCollection) {
            log('Events collection not found');
            return { summary: 'Events collection not found', created: 0, updated: 0, changes: [] };
        }

        // Determine sync window
        // For incremental: sync since last_run
        // For full: sync past 7 days + future 30 days
        const now = new Date();
        let timeMin, timeMax;

        if (lastRun && !this.forceFullSync) {
            // Incremental: events updated since last run
            // But Google Calendar doesn't have 'updatedMin' for events list
            // So we fetch a rolling window and let dedup handle it
            debug(`Incremental sync since: ${lastRun.toISOString()}`);
            timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
            timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead
        } else {
            debug('Full sync');
            timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days ahead
        }

        // Fetch events
        try {
            const events = await this.fetchEvents(accessToken, timeMin, timeMax, { log, debug });
            debug(`Fetched ${events.length} events`);

            const result = await this.processEvents(events, eventsCollection, data, { log, debug });

            const summary = result.created > 0 || result.updated > 0
                ? `${result.created} new, ${result.updated} updated`
                : 'No changes';

            return {
                summary,
                created: result.created,
                updated: result.updated,
                changes: result.changes,
            };
        } catch (e) {
            log(`Fetch failed: ${e.message}`);
            return { summary: 'Fetch failed', created: 0, updated: 0, changes: [] };
        }
    }

    // =========================================================================
    // OAuth Token Refresh
    // =========================================================================

    async getAccessToken(config, { log, debug }) {
        debug('Refreshing access token...');

        const response = await fetch(config.token_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: config.refresh_token }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
        }

        const tokens = await response.json();

        if (tokens.error) {
            throw new Error(tokens.error_description || tokens.error);
        }

        if (!tokens.access_token) {
            throw new Error('No access_token in response');
        }

        debug('Access token refreshed');
        return tokens.access_token;
    }

    // =========================================================================
    // Google Calendar API
    // =========================================================================

    async fetchEvents(accessToken, timeMin, timeMax, { log, debug }) {
        const params = new URLSearchParams({
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: 'true', // Expand recurring events
            orderBy: 'startTime',
            maxResults: '250',
        });

        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Calendar API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.items || [];
    }

    // =========================================================================
    // Event Processing
    // =========================================================================

    async processEvents(events, eventsCollection, data, { log, debug }) {
        let created = 0;
        let updated = 0;
        const changes = [];

        const existingRecords = await eventsCollection.getAllRecords();

        for (const event of events) {
            // Skip cancelled events
            if (event.status === 'cancelled') {
                continue;
            }

            const externalId = `gcal_${event.id}`;
            const existingRecord = existingRecords.find(r => r.text('external_id') === externalId);

            // Parse event times
            const isAllDay = !!event.start?.date; // All-day events use 'date', not 'dateTime'
            let startTime, endTime;

            if (isAllDay) {
                startTime = new Date(event.start.date);
                endTime = event.end?.date ? new Date(event.end.date) : startTime;
            } else {
                startTime = new Date(event.start.dateTime);
                endTime = event.end?.dateTime ? new Date(event.end.dateTime) : startTime;
            }

            // Build attendees list
            const attendees = (event.attendees || [])
                .filter(a => !a.self) // Exclude self
                .map(a => a.displayName || a.email)
                .slice(0, 5) // Limit to first 5
                .join(', ');

            const eventData = {
                external_id: externalId,
                title: event.summary || 'Untitled Event',
                source: 'Google',
                time_period: startTime,
                location: event.location || '',
                attendees: attendees,
                url: event.htmlLink || '',
                all_day: isAllDay,
                // For change detection
                updated_at: event.updated,
            };

            if (existingRecord) {
                // Check if needs update (compare updated timestamp)
                const currentUpdatedAt = existingRecord.text('updated_at');
                if (currentUpdatedAt !== event.updated) {
                    this.updateRecord(existingRecord, eventData);
                    updated++;
                    debug(`Updated: ${eventData.title}`);

                    changes.push({
                        verb: 'updated',
                        title: eventData.title,
                        guid: existingRecord.guid,
                        major: false,
                    });
                }
            } else {
                const record = await this.createRecord(eventsCollection, eventData);
                created++;
                debug(`Created: ${eventData.title}`);

                if (record) {
                    changes.push({
                        verb: 'added',
                        title: eventData.title,
                        guid: record.guid,
                        major: true, // New events are major
                    });
                }
            }
        }

        return { created, updated, changes };
    }

    // =========================================================================
    // Record Management
    // =========================================================================

    async createRecord(collection, eventData) {
        const recordGuid = collection.createRecord(eventData.title);
        if (!recordGuid) return null;

        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await collection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) {
            return null;
        }

        this.setRecordFields(record, eventData);

        // Add event description as markdown content
        if (eventData.description && window.syncHub?.insertMarkdown) {
            await window.syncHub.insertMarkdown(eventData.description, record, null);
        }

        return record;
    }

    updateRecord(record, eventData) {
        this.setRecordFields(record, eventData);
    }

    setRecordFields(record, data) {
        this.setField(record, 'external_id', data.external_id);
        this.setField(record, 'source', data.source);
        this.setField(record, 'time_period', data.time_period);
        this.setField(record, 'location', data.location);
        this.setField(record, 'attendees', data.attendees);
        this.setField(record, 'url', data.url);
        this.setField(record, 'all_day', data.all_day);
        this.setField(record, 'updated_at', data.updated_at);
    }

    setField(record, fieldId, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return;

            if (typeof value === 'string') {
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
}
