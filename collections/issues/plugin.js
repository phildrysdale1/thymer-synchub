const VERSION = 'v0.9.0';
/**
 * Issues Collection - Collection Plugin
 *
 * Provides query tools for the Issues collection.
 * Works with any source: GitHub, GitLab, Jira, Linear, etc.
 */

class Plugin extends CollectionPlugin {

    // State ID patterns - choice() returns ID not label
    // Standard IDs are lowercase, but user-added choices may have auto-generated IDs
    OPEN_STATE_IDS = ['open', 'next', 'in_progress'];
    CLOSED_STATE_IDS = ['closed', 'cancelled'];

    // Map labels to standard IDs for filtering
    STATE_LABEL_TO_ID = {
        'Open': 'open',
        'Next': 'next',
        'In Progress': 'in_progress',
        'Closed': 'closed',
        'Cancelled': 'cancelled'
    };

    // Check if a state ID matches any of the open states
    isOpenState(stateId) {
        if (!stateId) return false;
        const id = stateId.toLowerCase();
        // Check standard IDs
        if (this.OPEN_STATE_IDS.includes(id)) return true;
        // Handle user-created choices by checking if ID contains state name
        return id.includes('next') || id.includes('progress');
    }

    // Convert label to ID for filtering
    labelToId(label) {
        return this.STATE_LABEL_TO_ID[label] || label.toLowerCase().replace(/ /g, '_');
    }

    // Check if record state matches target (handles both labels and IDs)
    stateMatches(record, targetLabel) {
        const stateId = record.prop('state')?.choice();
        if (!stateId) return false;
        const targetId = this.labelToId(targetLabel);
        // Exact match on ID
        if (stateId === targetId) return true;
        // Fallback: check lowercase contains
        return stateId.toLowerCase().includes(targetId.toLowerCase());
    }

    // Convert ID back to label for display
    idToLabel(id, fieldType = 'state') {
        if (!id) return null;
        // Reverse lookup in the mapping
        for (const [label, mappedId] of Object.entries(this.STATE_LABEL_TO_ID)) {
            if (mappedId === id || id.toLowerCase() === mappedId) return label;
        }
        // For type field
        const typeMap = { 'issue': 'Issue', 'pull_request': 'PR', 'task': 'Task', 'bug': 'Bug', 'feature': 'Feature' };
        if (typeMap[id]) return typeMap[id];
        // Fallback: capitalize
        return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ');
    }

    async onLoad() {
        // Wait for SyncHub to register tools
        window.addEventListener('synchub-ready', () => this.registerTools(), { once: true });
        if (window.syncHub) this.registerTools();
    }

    registerTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'Issues',
            description: 'Issues and pull requests from any source (GitHub, GitLab, Jira, etc.)',
            schema: {
                title: 'Issue title',
                state: 'Open | Next | In Progress | Closed | Cancelled',
                type: 'Issue | PR | Task | Bug | Feature',
                repo: 'Repository name (owner/repo)',
                project: 'Project grouping',
                assignee: 'Assigned user',
                author: 'Issue author',
                number: 'Issue number',
                url: 'Link to issue'
            },
            tools: [
                {
                    name: 'find',
                    description: 'Find issues by state, repo, type, or assignee. Returns GUIDs - use [[GUID]] in your response to create clickable links.',
                    parameters: {
                        state: { type: 'string', enum: ['Open', 'Next', 'In Progress', 'Closed', 'Cancelled'], optional: true },
                        type: { type: 'string', enum: ['Issue', 'PR', 'Task', 'Bug', 'Feature'], optional: true },
                        repo: { type: 'string', description: 'Repository name (e.g. owner/repo)', optional: true },
                        assignee: { type: 'string', optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolFind(args, data)
                },
                {
                    name: 'get',
                    description: 'Get full details of an issue by number or title. Returns GUID - use [[GUID]] to link.',
                    parameters: { query: 'string' },
                    handler: async (args, data) => this.toolGet(args, data)
                },
                {
                    name: 'search',
                    description: 'Search issues by text in title or content. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        query: { type: 'string', description: 'Search text' },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolSearch(args, data)
                },
                {
                    name: 'summarize_open',
                    description: 'Get summary of all open issues. Returns GUIDs - use [[GUID]] to create clickable links to each issue.',
                    parameters: {
                        repo: { type: 'string', optional: true },
                        project: { type: 'string', optional: true }
                    },
                    handler: async (args, data) => this.toolSummarizeOpen(args, data)
                }
            ]
        });

        console.log('[Issues] Registered collection tools');
    }

    // =========================================================================
    // Tool Handlers
    // =========================================================================

    async getCollection(data) {
        const collections = await data.getAllCollections();
        return collections.find(c => c.getName() === 'Issues');
    }

    async toolFind(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Issues collection not found' };

        const records = await collection.getAllRecords();
        let results = records;

        if (args.state) {
            results = results.filter(r => this.stateMatches(r, args.state));
        }
        if (args.type) {
            // Type also uses choice() which returns ID
            const typeId = args.type.toLowerCase().replace(/ /g, '_').replace('pr', 'pull_request');
            results = results.filter(r => {
                const recordTypeId = r.prop('type')?.choice();
                return recordTypeId === typeId || recordTypeId?.toLowerCase() === args.type.toLowerCase();
            });
        }
        if (args.repo) {
            const repoLower = args.repo.toLowerCase();
            results = results.filter(r => r.text('repo')?.toLowerCase().includes(repoLower));
        }
        if (args.assignee) {
            const assigneeLower = args.assignee.toLowerCase();
            results = results.filter(r => r.text('assignee')?.toLowerCase().includes(assigneeLower));
        }

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            state: this.idToLabel(r.prop('state')?.choice(), 'state'),
            type: this.idToLabel(r.prop('type')?.choice(), 'type'),
            repo: r.text('repo'),
            number: r.prop('number')?.number(),
            assignee: r.text('assignee')
        }));
    }

    async toolGet(args, data) {
        if (!args.query) return { error: 'Query required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Issues collection not found' };

        const records = await collection.getAllRecords();
        const query = args.query.toLowerCase();

        // Try to match by number first
        const numberMatch = query.match(/^#?(\d+)$/);
        if (numberMatch) {
            const num = parseInt(numberMatch[1], 10);
            const found = records.find(r => r.prop('number')?.number() === num);
            if (found) {
                return {
                    guid: found.guid,
                    title: found.getName(),
                    state: this.idToLabel(found.prop('state')?.choice(), 'state'),
                    type: this.idToLabel(found.prop('type')?.choice(), 'type'),
                    repo: found.text('repo'),
                    number: found.prop('number')?.number(),
                    url: found.text('url')
                };
            }
        }

        // Fall back to title search
        const found = records.find(r => r.getName()?.toLowerCase().includes(query));
        if (found) {
            return {
                guid: found.guid,
                title: found.getName(),
                state: this.idToLabel(found.prop('state')?.choice(), 'state'),
                type: this.idToLabel(found.prop('type')?.choice(), 'type'),
                repo: found.text('repo'),
                number: found.prop('number')?.number(),
                url: found.text('url')
            };
        }

        return { error: 'Issue not found' };
    }

    async toolSearch(args, data) {
        if (!args.query) return { error: 'Query required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Issues collection not found' };

        const records = await collection.getAllRecords();
        const queryLower = args.query.toLowerCase();

        let results = records.filter(r => {
            const title = r.getName()?.toLowerCase() || '';
            const repo = r.text('repo')?.toLowerCase() || '';
            return title.includes(queryLower) || repo.includes(queryLower);
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            state: this.idToLabel(r.prop('state')?.choice(), 'state'),
            type: this.idToLabel(r.prop('type')?.choice(), 'type'),
            repo: r.text('repo')
        }));
    }

    async toolSummarizeOpen(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Issues collection not found' };

        const records = await collection.getAllRecords();

        // Filter to open states using ID matching (choice() returns ID not label)
        let results = records.filter(r => this.isOpenState(r.prop('state')?.choice()));

        if (args.repo) {
            const repoLower = args.repo.toLowerCase();
            results = results.filter(r => r.text('repo')?.toLowerCase().includes(repoLower));
        }
        if (args.project) {
            // Project is also a choice field - compare IDs
            const projectId = args.project.toLowerCase().replace(/ /g, '_');
            results = results.filter(r => {
                const recordProjectId = r.prop('project')?.choice();
                return recordProjectId === projectId || recordProjectId?.toLowerCase().includes(args.project.toLowerCase());
            });
        }

        // Group by state (use labels for grouping keys)
        const byState = {};
        for (const r of results) {
            const stateId = r.prop('state')?.choice();
            const stateLabel = this.idToLabel(stateId, 'state') || 'Unknown';
            if (!byState[stateLabel]) byState[stateLabel] = [];
            byState[stateLabel].push({
                guid: r.guid,
                title: r.getName(),
                repo: r.text('repo'),
                type: this.idToLabel(r.prop('type')?.choice(), 'type')
            });
        }

        return {
            total: results.length,
            by_state: byState
        };
    }
}
