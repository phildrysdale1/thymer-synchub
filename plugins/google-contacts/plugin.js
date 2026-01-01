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
        // Command palette: Connect Google Contacts
        this.connectCommand = this.ui.addCommandPaletteCommand({
            label: 'Connect Google Contacts',
            icon: 'link',
            onSelected: () => this.startConnect()
        });

        // Command palette: Full Sync
        this.fullSyncCommand = this.ui.addCommandPaletteCommand({
            label: 'Google Contacts Full Sync',
            icon: 'wallet',
            onSelected: () => this.triggerSync(true)
        });

        // Command palette: Incremental Sync
        this.syncCommand = this.ui.addCommandPaletteCommand({
            label: 'Google Contacts Sync',
            icon: 'wallet',
            onSelected: () => this.triggerSync(false)
        });

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
        if (this.connectCommand) {
            this.connectCommand.remove();
        }
        if (this.fullSyncCommand) {
            this.fullSyncCommand.remove();
        }
        if (this.syncCommand) {
            this.syncCommand.remove();
        }
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

            // Trigger initial sync
            this.triggerSync(true);
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

    async triggerSync(forceFullSync = false) {
        this.forceFullSync = forceFullSync;
        if (window.syncHub) {
            await window.syncHub.requestSync('google-contacts-sync');
        }
        this.forceFullSync = false;
    }

    async registerWithSyncHub() {
        console.log('[Google Contacts] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'google-contacts-sync',
            name: 'Google Contacts',
            icon: 'ti-wallet',
            defaultInterval: '1h', // Contacts don't change often
            sync: async (ctx) => this.sync(ctx),
        });

        // Register collection tools for agents
        this.registerCollectionTools();

        console.log('[Google Contacts] Registered successfully');
    }

    registerCollectionTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'People',
            description: 'Contacts and relationships from Google Contacts',
            schema: {
                title: 'Person name',
                email: 'Email address',
                phone: 'Phone number',
                organization: 'Company name',
                job_title: 'Job title',
                notes: 'Notes about the person',
                keep_in_touch: 'Weekly | Monthly | Quarterly | Yearly | Never',
                last_contact: 'Date of last contact'
            },
            tools: [
                {
                    name: 'find',
                    description: 'Find people by name, organization, or contact frequency. Returns GUIDs - use [[GUID]] in your response to create clickable links.',
                    parameters: {
                        name: { type: 'string', description: 'Name to search for (partial match)', optional: true },
                        organization: { type: 'string', description: 'Company name (partial match)', optional: true },
                        keep_in_touch: { type: 'string', enum: ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Never'], optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolFindPeople(args, data)
                },
                {
                    name: 'search',
                    description: 'Search people by any field (name, email, organization, notes). Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        query: { type: 'string', description: 'Search text' },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolSearchPeople(args, data)
                },
                {
                    name: 'needs_contact',
                    description: 'Get people who are overdue for contact based on their keep_in_touch setting. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {},
                    handler: async (args, data) => this.toolNeedsContact(args, data)
                }
            ]
        });
    }

    // =========================================================================
    // Tool Handlers
    // =========================================================================

    async toolFindPeople(args, data) {
        const collections = await data.getAllCollections();
        const people = collections.find(c => c.getName() === 'People');
        if (!people) return { error: 'People collection not found' };

        const records = await people.getAllRecords();
        let results = records;

        // Filter by name
        if (args.name) {
            const nameLower = args.name.toLowerCase();
            results = results.filter(r =>
                r.getName()?.toLowerCase().includes(nameLower)
            );
        }

        // Filter by organization
        if (args.organization) {
            const orgLower = args.organization.toLowerCase();
            results = results.filter(r =>
                r.text('organization')?.toLowerCase().includes(orgLower)
            );
        }

        // Filter by keep_in_touch
        if (args.keep_in_touch) {
            results = results.filter(r => r.prop('keep_in_touch')?.choice() === args.keep_in_touch);
        }

        // Sort alphabetically
        results = results.sort((a, b) => (a.getName() || '').localeCompare(b.getName() || ''));

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            name: r.getName(),
            email: r.text('email'),
            organization: r.text('organization'),
            job_title: r.text('job_title'),
            keep_in_touch: r.prop('keep_in_touch')?.choice()
        }));
    }

    async toolSearchPeople(args, data) {
        if (!args.query) return { error: 'Query required' };

        const collections = await data.getAllCollections();
        const people = collections.find(c => c.getName() === 'People');
        if (!people) return { error: 'People collection not found' };

        const records = await people.getAllRecords();
        const queryLower = args.query.toLowerCase();

        let results = records.filter(r => {
            const name = r.getName()?.toLowerCase() || '';
            const email = r.text('email')?.toLowerCase() || '';
            const org = r.text('organization')?.toLowerCase() || '';
            const notes = r.text('notes')?.toLowerCase() || '';
            return name.includes(queryLower) || email.includes(queryLower) ||
                   org.includes(queryLower) || notes.includes(queryLower);
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            name: r.getName(),
            email: r.text('email'),
            organization: r.text('organization'),
            job_title: r.text('job_title')
        }));
    }

    async toolNeedsContact(args, data) {
        const collections = await data.getAllCollections();
        const people = collections.find(c => c.getName() === 'People');
        if (!people) return { error: 'People collection not found' };

        const records = await people.getAllRecords();
        const now = new Date();

        // Calculate overdue based on keep_in_touch frequency
        const intervalDays = {
            'Weekly': 7,
            'Monthly': 30,
            'Quarterly': 90,
            'Yearly': 365,
            'Never': Infinity
        };

        let results = records.filter(r => {
            const frequency = r.prop('keep_in_touch')?.choice();
            if (!frequency || frequency === 'Never') return false;

            const lastContact = r.prop('last_contact')?.date();
            if (!lastContact) return true; // Never contacted = overdue

            const daysSinceContact = (now - lastContact) / (1000 * 60 * 60 * 24);
            return daysSinceContact > (intervalDays[frequency] || Infinity);
        });

        // Sort by most overdue first
        results = results.sort((a, b) => {
            const dateA = a.prop('last_contact')?.date() || new Date(0);
            const dateB = b.prop('last_contact')?.date() || new Date(0);
            return dateA - dateB;
        });

        return results.map(r => ({
            guid: r.guid,
            name: r.getName(),
            email: r.text('email'),
            organization: r.text('organization'),
            keep_in_touch: r.prop('keep_in_touch')?.choice(),
            last_contact: r.prop('last_contact')?.date()?.toISOString()
        }));
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
                // Check if needs update (compare metadata updateTime)
                const currentUpdatedAt = existingRecord.text('updated_at');
                const newUpdatedAt = contact.metadata?.sources?.[0]?.updateTime || '';

                if (currentUpdatedAt !== newUpdatedAt) {
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
