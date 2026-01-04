const VERSION = 'v1.0.0';
/**
 * Captures Collection - Collection Plugin
 *
 * Provides query tools for the Captures collection.
 * Works with any source: Readwise, Kindle, Web, etc.
 */

class Plugin extends CollectionPlugin {

    // Map labels to IDs for choice fields (choice() returns ID not label)
    SOURCE_LABEL_TO_ID = {
        'Readwise': 'readwise',
        'Kindle': 'kindle',
        'Web': 'web',
        'Manual': 'manual'
    };

    // Convert label to ID for filtering
    labelToId(label) {
        return this.SOURCE_LABEL_TO_ID[label] || label.toLowerCase();
    }

    // Convert ID back to label for display
    idToLabel(id) {
        if (!id) return null;
        for (const [label, mappedId] of Object.entries(this.SOURCE_LABEL_TO_ID)) {
            if (mappedId === id || id.toLowerCase() === mappedId) return label;
        }
        return id.charAt(0).toUpperCase() + id.slice(1);
    }

    // Check if record's source matches target (handles both labels and IDs)
    sourceMatches(record, targetLabel) {
        const sourceId = record.prop('source')?.choice();
        if (!sourceId) return false;
        const targetId = this.labelToId(targetLabel);
        return sourceId === targetId || sourceId.toLowerCase() === targetId.toLowerCase();
    }

    async onLoad() {
        // Wait for SyncHub to register tools
        window.addEventListener('synchub-ready', () => this.registerTools(), { once: true });
        if (window.syncHub) this.registerTools();
    }

    registerTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'Captures',
            version: VERSION,
            description: 'Highlights, notes, and bookmarks from any source (Readwise, Kindle, Web, etc.)',
            schema: {
                title: 'Capture title or highlight text',
                content: 'Full highlight/note content',
                source: 'Readwise | Kindle | Web | Manual',
                source_title: 'Book/article title',
                source_author: 'Author name',
                source_url: 'URL of source',
                captured_at: 'When captured',
                tags: 'User tags'
            },
            tools: [
                {
                    name: 'find',
                    description: 'Find captures by source or author. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        source: { type: 'string', enum: ['Readwise', 'Kindle', 'Web', 'Manual'], optional: true },
                        author: { type: 'string', description: 'Author name', optional: true },
                        source_title: { type: 'string', description: 'Book or article title', optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolFind(args, data)
                },
                {
                    name: 'search',
                    description: 'Search captures by text in content or title. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        query: { type: 'string', description: 'Search text' },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolSearch(args, data)
                },
                {
                    name: 'recent',
                    description: 'Get recent captures. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        limit: { type: 'number', optional: true },
                        source: { type: 'string', enum: ['Readwise', 'Kindle', 'Web', 'Manual'], optional: true }
                    },
                    handler: async (args, data) => this.toolRecent(args, data)
                },
                {
                    name: 'by_book',
                    description: 'Get all captures from a specific book or article. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        title: { type: 'string', description: 'Book or article title' }
                    },
                    handler: async (args, data) => this.toolByBook(args, data)
                }
            ]
        });

        console.log('[Captures] Registered collection tools');
    }

    // =========================================================================
    // Tool Handlers
    // =========================================================================

    async getCollection(data) {
        const collections = await data.getAllCollections();
        return collections.find(c => c.getName() === 'Captures');
    }

    async toolFind(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Captures collection not found' };

        const records = await collection.getAllRecords();
        let results = records;

        if (args.source) {
            results = results.filter(r => this.sourceMatches(r, args.source));
        }
        if (args.author) {
            const authorLower = args.author.toLowerCase();
            results = results.filter(r => r.text('source_author')?.toLowerCase().includes(authorLower));
        }
        if (args.source_title) {
            const titleLower = args.source_title.toLowerCase();
            results = results.filter(r => r.text('source_title')?.toLowerCase().includes(titleLower));
        }

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            source: this.idToLabel(r.prop('source')?.choice()),
            source_title: r.text('source_title'),
            source_author: r.text('source_author'),
            captured_at: r.prop('captured_at')?.date()?.toISOString()
        }));
    }

    async toolSearch(args, data) {
        if (!args.query) return { error: 'Query required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Captures collection not found' };

        const records = await collection.getAllRecords();
        const queryLower = args.query.toLowerCase();

        let results = records.filter(r => {
            const title = r.getName()?.toLowerCase() || '';
            const content = r.text('content')?.toLowerCase() || '';
            const sourceTitle = r.text('source_title')?.toLowerCase() || '';
            return title.includes(queryLower) || content.includes(queryLower) || sourceTitle.includes(queryLower);
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            content: r.text('content')?.substring(0, 200),
            source: this.idToLabel(r.prop('source')?.choice()),
            source_title: r.text('source_title')
        }));
    }

    async toolRecent(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Captures collection not found' };

        let records = await collection.getAllRecords();

        if (args.source) {
            records = records.filter(r => this.sourceMatches(r, args.source));
        }

        // Sort by captured_at descending
        records.sort((a, b) => {
            const dateA = a.prop('captured_at')?.date() || new Date(0);
            const dateB = b.prop('captured_at')?.date() || new Date(0);
            return dateB - dateA;
        });

        const limit = args.limit || 10;
        const results = records.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            content: r.text('content')?.substring(0, 200),
            source: this.idToLabel(r.prop('source')?.choice()),
            source_title: r.text('source_title'),
            captured_at: r.prop('captured_at')?.date()?.toISOString()
        }));
    }

    async toolByBook(args, data) {
        if (!args.title) return { error: 'Title required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Captures collection not found' };

        const records = await collection.getAllRecords();
        const titleLower = args.title.toLowerCase();

        const results = records.filter(r =>
            r.text('source_title')?.toLowerCase().includes(titleLower)
        );

        return {
            book: args.title,
            count: results.length,
            captures: results.map(r => ({
                guid: r.guid,
                title: r.getName(),
                content: r.text('content')?.substring(0, 300),
                captured_at: r.prop('captured_at')?.date()?.toISOString()
            }))
        };
    }
}
