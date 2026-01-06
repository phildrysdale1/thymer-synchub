const VERSION = 'v1.0.3';
/**
 * People Collection - Collection Plugin
 *
 * Provides query tools for the People collection.
 * Works with any source: Google, LinkedIn, Manual, etc.
 */

class Plugin extends CollectionPlugin {

    // Map labels to IDs for choice fields (choice() returns ID not label)
    KEEP_IN_TOUCH_LABEL_TO_ID = {
        'Weekly': 'weekly',
        'Monthly': 'monthly',
        'Quarterly': 'quarterly',
        'Yearly': 'yearly',
        'Never': 'never'
    };

    // Convert label to ID for filtering
    labelToId(label) {
        return this.KEEP_IN_TOUCH_LABEL_TO_ID[label] || label.toLowerCase();
    }

    // Convert ID back to label for display
    idToLabel(id) {
        if (!id) return null;
        for (const [label, mappedId] of Object.entries(this.KEEP_IN_TOUCH_LABEL_TO_ID)) {
            if (mappedId === id || id.toLowerCase() === mappedId) return label;
        }
        return id.charAt(0).toUpperCase() + id.slice(1);
    }

    // Check if record's keep_in_touch matches target (handles both labels and IDs)
    keepInTouchMatches(record, targetLabel) {
        const choiceId = record.prop('keep_in_touch')?.choice();
        if (!choiceId) return false;
        const targetId = this.labelToId(targetLabel);
        return choiceId === targetId || choiceId.toLowerCase() === targetId.toLowerCase();
    }

    // Get keep_in_touch value for comparison (returns normalized value)
    getKeepInTouchValue(record) {
        const id = record.prop('keep_in_touch')?.choice();
        return this.idToLabel(id);
    }

    async onLoad() {
        // Wait for SyncHub to register tools
        window.addEventListener('synchub-ready', () => this.registerTools(), { once: true });
        if (window.syncHub) this.registerTools();
    }

    registerTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'People',
            version: VERSION,
            description: 'Contacts and relationships from any source (Google, LinkedIn, etc.)',
            schema: {
                title: 'Person name',
                email: 'Email address',
                phone: 'Phone number',
                organization: 'Company/organization',
                job_title: 'Job title',
                notes: 'Notes about the person',
                anniversary: 'Important date',
                keep_in_touch: 'Weekly | Monthly | Quarterly | Yearly | Never',
                last_contact: 'Date of last contact'
            },
            tools: [
                {
                    name: 'find',
                    description: 'Find people by organization or keep-in-touch setting. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        organization: { type: 'string', description: 'Company name', optional: true },
                        keep_in_touch: { type: 'string', enum: ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Never'], optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolFind(args, data)
                },
                {
                    name: 'search',
                    description: 'Search people by name, email, organization, or notes. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        query: { type: 'string', description: 'Search text' },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolSearch(args, data)
                },
                {
                    name: 'needs_contact',
                    description: 'Get people who are overdue for contact based on keep-in-touch setting. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolNeedsContact(args, data)
                },
                {
                    name: 'at_organization',
                    description: 'Get all people at a specific organization. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        organization: { type: 'string', description: 'Organization name' }
                    },
                    handler: async (args, data) => this.toolAtOrganization(args, data)
                },
                {
                    name: 'recent_contacts',
                    description: 'Get recently contacted people. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        days: { type: 'number', description: 'Days to look back (default 30)', optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolRecentContacts(args, data)
                }
            ]
        });

        console.log('[People] Registered collection tools');
    }

    // =========================================================================
    // Tool Handlers
    // =========================================================================

    async getCollection(data) {
        const collections = await data.getAllCollections();
        return collections.find(c => c.getName() === 'People');
    }

    async toolFind(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'People collection not found' };

        const records = await collection.getAllRecords();
        let results = records;

        if (args.organization) {
            const orgLower = args.organization.toLowerCase();
            results = results.filter(r => r.text('organization')?.toLowerCase().includes(orgLower));
        }
        if (args.keep_in_touch) {
            results = results.filter(r => this.keepInTouchMatches(r, args.keep_in_touch));
        }

        // Sort by name
        results.sort((a, b) => (a.getName() || '').localeCompare(b.getName() || ''));

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            name: r.getName(),
            email: r.text('email'),
            organization: r.text('organization'),
            job_title: r.text('job_title'),
            keep_in_touch: this.idToLabel(r.prop('keep_in_touch')?.choice())
        }));
    }

    async toolSearch(args, data) {
        if (!args.query) return { error: 'Query required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'People collection not found' };

        const records = await collection.getAllRecords();
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
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'People collection not found' };

        const records = await collection.getAllRecords();
        const now = new Date();

        // Calculate overdue contacts (compare using labels after converting from IDs)
        const overdueResults = records.filter(r => {
            const keepInTouchId = r.prop('keep_in_touch')?.choice();
            const keepInTouch = this.idToLabel(keepInTouchId);
            if (!keepInTouch || keepInTouch === 'Never') return false;

            const lastContact = r.prop('last_contact')?.date();
            if (!lastContact) return true; // Never contacted

            const daysSinceContact = (now - lastContact) / (1000 * 60 * 60 * 24);

            switch (keepInTouch) {
                case 'Weekly': return daysSinceContact > 7;
                case 'Monthly': return daysSinceContact > 30;
                case 'Quarterly': return daysSinceContact > 90;
                case 'Yearly': return daysSinceContact > 365;
                default: return false;
            }
        });

        // Sort by how overdue they are
        overdueResults.sort((a, b) => {
            const dateA = a.prop('last_contact')?.date() || new Date(0);
            const dateB = b.prop('last_contact')?.date() || new Date(0);
            return dateA - dateB; // Oldest first
        });

        const limit = args.limit || 10;
        const results = overdueResults.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            name: r.getName(),
            email: r.text('email'),
            organization: r.text('organization'),
            keep_in_touch: this.idToLabel(r.prop('keep_in_touch')?.choice()),
            last_contact: r.prop('last_contact')?.date()?.toISOString()
        }));
    }

    async toolAtOrganization(args, data) {
        if (!args.organization) return { error: 'Organization required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'People collection not found' };

        const records = await collection.getAllRecords();
        const orgLower = args.organization.toLowerCase();

        const results = records.filter(r =>
            r.text('organization')?.toLowerCase().includes(orgLower)
        );

        // Sort by name
        results.sort((a, b) => (a.getName() || '').localeCompare(b.getName() || ''));

        return {
            organization: args.organization,
            count: results.length,
            people: results.map(r => ({
                guid: r.guid,
                name: r.getName(),
                email: r.text('email'),
                job_title: r.text('job_title'),
                keep_in_touch: this.idToLabel(r.prop('keep_in_touch')?.choice())
            }))
        };
    }

    async toolRecentContacts(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'People collection not found' };

        const records = await collection.getAllRecords();
        const now = new Date();
        const days = args.days || 30;
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);

        let results = records.filter(r => {
            const lastContact = r.prop('last_contact')?.date();
            return lastContact && lastContact >= cutoff;
        });

        // Sort by most recent first
        results.sort((a, b) => {
            const dateA = a.prop('last_contact')?.date() || new Date(0);
            const dateB = b.prop('last_contact')?.date() || new Date(0);
            return dateB - dateA;
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            name: r.getName(),
            email: r.text('email'),
            organization: r.text('organization'),
            last_contact: r.prop('last_contact')?.date()?.toISOString()
        }));
    }
}
