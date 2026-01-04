const VERSION = 'v1.0.0';
/**
 * Google Contacts Sync - App Plugin
 *
 * Syncs contacts from Google to the People collection.
 * Uses user-deployed thymer-self-auth worker for OAuth (Contacts is RESTRICTED scope).
 *
 * Config field (set before connecting):
 *   {"auth_url": "https://your-endpoint.workers.dev/google?service=contacts"}
 *
 * Token field (set by OAuth flow):
 *   {"refresh_token": "...", "token_endpoint": "..."}
 */

class Plugin extends AppPlugin {

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async onLoad() {
        // Listen for auth callback from popup
        this.messageHandler = (event) => this.handleAuthMessage(event);
        window.addEventListener('message', this.messageHandler);

        // Listen for Sync Hub ready event (handles reloads)
        this.syncHubReadyHandler = () => this.registerWithSyncHub();
        window.addEventListener('synchub-ready', this.syncHubReadyHandler);

        // Also check if Sync Hub is already ready
        if (window.syncHub) {
            this.registerWithSyncHub();
        }
    }

    onUnload() {
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
        }
        if (this.syncHubReadyHandler) {
            window.removeEventListener('synchub-ready', this.syncHubReadyHandler);
        }
        if (window.syncHub) {
            window.syncHub.unregister('google-contacts-sync');
        }
    }

    // =========================================================================
    // OAuth Connect Flow
    // =========================================================================

    async startConnect() {
        // Get auth_url from config
        const authUrl = await this.getAuthUrl();

        if (!authUrl) {
            alert('Please configure auth_url in the Google Contacts config field first.\n\nExample: {"auth_url": "https://your-endpoint.workers.dev/google?service=contacts"}');
            return;
        }

        // Open auth in popup
        const width = 500;
        const height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;

        window.open(
            authUrl,
            'thymer-auth',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    }

    async getAuthUrl() {
        try {
            const collections = await this.data.getAllCollections();
            const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');
            if (!syncHubCollection) return null;

            const records = await syncHubCollection.getAllRecords();
            const myRecord = records.find(r => r.text('plugin_id') === 'google-contacts-sync');
            if (!myRecord) return null;

            const configJson = myRecord.text('config');
            if (!configJson) return null;

            const config = JSON.parse(configJson);
            return config.auth_url || null;
        } catch (e) {
            console.error('[Google Contacts] Error reading auth_url:', e);
            return null;
        }
    }

    async handleAuthMessage(event) {
        // Validate message
        if (!event.data || event.data.type !== 'thymer-auth') {
            return;
        }

        if (event.data.service !== 'contacts') {
            return; // Not for us
        }

        const config = event.data.config;
        if (!config || !config.refresh_token || !config.token_endpoint) {
            console.error('[Google Contacts] Invalid config received');
            return;
        }

        // Save token to Sync Hub record
        try {
            await this.saveToken(config);
            console.log('[Google Contacts] Token saved successfully');

            // Trigger initial full sync
            if (window.syncHub) {
                window.syncHub.requestSync('google-contacts-sync', { full: true, manual: true });
            }
        } catch (e) {
            console.error('[Google Contacts] Failed to save token:', e);
        }
    }

    async saveToken(tokenData) {
        const collections = await this.data.getAllCollections();
        const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');

        if (!syncHubCollection) {
            throw new Error('Sync Hub collection not found');
        }

        const records = await syncHubCollection.getAllRecords();
        let myRecord = records.find(r => r.text('plugin_id') === 'google-contacts-sync');

        if (!myRecord) {
            throw new Error('Plugin record not found - please set config first');
        }

        // Save token data to token field
        const tokenProp = myRecord.prop('token');
        if (tokenProp) {
            tokenProp.set(JSON.stringify(tokenData));
        }

        // Enable the plugin
        const enabledProp = myRecord.prop('enabled');
        if (enabledProp) {
            enabledProp.set(true);
        }
    }


    async registerWithSyncHub() {
        console.log('[Google Contacts] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'google-contacts-sync',
            name: 'Google Contacts',
            icon: 'ti-wallet',
            defaultInterval: '1h', // Contacts don't change often
            version: VERSION,
            sync: async (ctx) => this.sync(ctx),
        });
        // Register connect function for dashboard button
        window.syncHub.registerConnect('google-contacts-sync', () => this.startConnect());
        console.log('[Google Contacts] Registered successfully');
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
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'google-contacts-sync');

        if (!myRecord) {
            debug('Google Contacts record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        // Token field contains refresh_token and token_endpoint
        const tokenJson = myRecord.text('token');

        if (!tokenJson) {
            debug('No token - use "Connect Google Contacts" command');
            return { summary: 'Not connected', created: 0, updated: 0, changes: [] };
        }

        let tokenData;
        try {
            tokenData = JSON.parse(tokenJson);
        } catch (e) {
            log('Invalid token JSON');
            return { summary: 'Invalid token', created: 0, updated: 0, changes: [] };
        }

        if (!tokenData.refresh_token || !tokenData.token_endpoint) {
            log('Token missing refresh_token or token_endpoint');
            return { summary: 'Invalid token', created: 0, updated: 0, changes: [] };
        }

        // Get fresh access token
        let accessToken;
        try {
            accessToken = await this.getAccessToken(tokenData, { log, debug });
        } catch (e) {
            log(`Token refresh failed: ${e.message}`);
            return { summary: 'Auth failed', created: 0, updated: 0, changes: [] };
        }

        // Find People collection
        const peopleCollection = collections.find(c => c.getName() === 'People');

        if (!peopleCollection) {
            log('People collection not found');
            return { summary: 'People collection not found', created: 0, updated: 0, changes: [] };
        }

        // Fetch contacts
        try {
            debug('Fetching contacts from Google...');
            const contacts = await this.fetchContacts(accessToken, { log, debug });
            debug(`Fetched ${contacts.length} contacts`);

            const result = await this.processContacts(contacts, peopleCollection, data, { log, debug });

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
    // Google People API
    // =========================================================================

    async fetchContacts(accessToken, { log, debug }) {
        const allContacts = [];
        let nextPageToken = null;

        do {
            const params = new URLSearchParams({
                personFields: 'names,emailAddresses,phoneNumbers,organizations,events,biographies,metadata',
                pageSize: '1000',
                sortOrder: 'LAST_MODIFIED_DESCENDING',
            });

            if (nextPageToken) {
                params.set('pageToken', nextPageToken);
            }

            const url = `https://people.googleapis.com/v1/people/me/connections?${params}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`People API error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            const connections = data.connections || [];
            allContacts.push(...connections);

            nextPageToken = data.nextPageToken;
            debug(`Fetched page with ${connections.length} contacts, total: ${allContacts.length}`);

        } while (nextPageToken);

        return allContacts;
    }

    // =========================================================================
    // Contact Processing
    // =========================================================================

    async processContacts(contacts, peopleCollection, data, { log, debug }) {
        let created = 0;
        let updated = 0;
        const changes = [];

        const existingRecords = await peopleCollection.getAllRecords();

        for (const contact of contacts) {
            // Extract resourceName (e.g., "people/c12345678")
            const resourceName = contact.resourceName;
            if (!resourceName) continue;

            const externalId = `gcontacts_${resourceName}`;
            const existingRecord = existingRecords.find(r => r.text('external_id') === externalId);

            // Extract contact data
            const contactData = this.mapContactToRecord(contact, externalId);

            // Skip contacts without a name
            if (!contactData.title) {
                continue;
            }

            if (existingRecord) {
                // Check if actual content changed (not just Google's updateTime)
                if (this.hasContentChanged(existingRecord, contactData)) {
                    this.updateRecord(existingRecord, contactData);
                    updated++;
                    debug(`Updated: ${contactData.title}`);

                    changes.push({
                        verb: 'updated',
                        title: null,
                        guid: existingRecord.guid,
                        major: false,
                    });
                }
            } else {
                const record = await this.createRecord(peopleCollection, contactData);
                if (record) {
                    created++;
                    debug(`Created: ${contactData.title}`);

                    changes.push({
                        verb: 'created',
                        title: null,
                        guid: record.guid,
                        major: true,
                    });
                }
            }
        }

        return { created, updated, changes };
    }

    mapContactToRecord(contact, externalId) {
        // Extract primary name
        const name = contact.names?.[0];
        const displayName = name?.displayName ||
            [name?.givenName, name?.familyName].filter(Boolean).join(' ') ||
            '';

        // Extract primary email
        const primaryEmail = contact.emailAddresses?.find(e => e.metadata?.primary) ||
            contact.emailAddresses?.[0];
        const email = primaryEmail?.value || '';

        // Extract primary phone
        const primaryPhone = contact.phoneNumbers?.find(p => p.metadata?.primary) ||
            contact.phoneNumbers?.[0];
        const phone = primaryPhone?.value || '';

        // Extract organization info
        const org = contact.organizations?.[0];
        const organization = org?.name || '';
        const jobTitle = org?.title || '';

        // Extract anniversary from events
        const anniversary = contact.events?.find(e => e.type === 'anniversary');
        let anniversaryDate = null;
        if (anniversary?.date) {
            const d = anniversary.date;
            // Google stores dates as {year, month, day}
            if (d.year && d.month && d.day) {
                anniversaryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
            }
        }

        // Extract notes from biographies
        const notes = contact.biographies?.[0]?.value || '';

        // Get update time from metadata
        const updatedAt = contact.metadata?.sources?.[0]?.updateTime || '';

        return {
            external_id: externalId,
            title: displayName,
            source: 'Google', // Use LABEL for setChoice()
            email: email,
            phone: phone,
            organization: organization,
            job_title: jobTitle,
            notes: notes,
            anniversary: anniversaryDate,
            updated_at: updatedAt,
        };
    }

    // =========================================================================
    // Record Management
    // =========================================================================

    async createRecord(collection, contactData) {
        const recordGuid = collection.createRecord(contactData.title);
        if (!recordGuid) return null;

        // Wait for record to sync (SDK quirk)
        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await collection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) {
            console.warn(`[Google Contacts] Could not get record: ${recordGuid}`);
            return null;
        }

        this.setRecordFields(record, contactData);
        return record;
    }

    updateRecord(record, contactData) {
        this.setRecordFields(record, contactData);
    }

    setRecordFields(record, data) {
        this.setField(record, 'external_id', data.external_id);
        this.setField(record, 'source', data.source);
        this.setField(record, 'email', data.email);
        this.setField(record, 'phone', data.phone);
        this.setField(record, 'organization', data.organization);
        this.setField(record, 'job_title', data.job_title);
        this.setField(record, 'updated_at', data.updated_at);

        // Only set notes if not empty (don't overwrite user notes)
        if (data.notes) {
            this.setField(record, 'notes', data.notes);
        }

        // Set anniversary datetime
        if (data.anniversary) {
            this.setDateTimeField(record, 'anniversary', data.anniversary);
        }

        // Set created_at on first sync
        if (!record.prop('created_at')?.date()) {
            this.setDateTimeField(record, 'created_at', new Date().toISOString());
        }
    }

    /**
     * Compare actual contact content to detect real changes.
     * More reliable than comparing Google's updateTime.
     */
    hasContentChanged(existingRecord, newData) {
        // Compare name (title)
        if (existingRecord.getName() !== newData.title) return true;

        // Compare key text fields
        const fieldsToCompare = ['email', 'phone', 'organization', 'job_title'];
        for (const field of fieldsToCompare) {
            const current = existingRecord.text(field) || '';
            const newVal = newData[field] || '';
            if (current !== newVal) return true;
        }

        // No meaningful changes detected
        return false;
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
}
