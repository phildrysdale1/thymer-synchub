/**
 * Issues Collection - Collection Plugin
 *
 * Provides query tools for the Issues collection.
 * Works with any source: GitHub, GitLab, Jira, Linear, etc.
 */

class Plugin extends CollectionPlugin {

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
            results = results.filter(r => r.prop('state')?.choice() === args.state);
        }
        if (args.type) {
            results = results.filter(r => r.prop('type')?.choice() === args.type);
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
            state: r.prop('state')?.choice(),
            type: r.prop('type')?.choice(),
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
                    state: found.prop('state')?.choice(),
                    type: found.prop('type')?.choice(),
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
                state: found.prop('state')?.choice(),
                type: found.prop('type')?.choice(),
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
            state: r.prop('state')?.choice(),
            type: r.prop('type')?.choice(),
            repo: r.text('repo')
        }));
    }

    async toolSummarizeOpen(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Issues collection not found' };

        const records = await collection.getAllRecords();

        // Filter to open states
        const openStates = ['Open', 'Next', 'In Progress'];
        let results = records.filter(r => openStates.includes(r.prop('state')?.choice()));

        if (args.repo) {
            const repoLower = args.repo.toLowerCase();
            results = results.filter(r => r.text('repo')?.toLowerCase().includes(repoLower));
        }
        if (args.project) {
            results = results.filter(r => r.prop('project')?.choice() === args.project);
        }

        // Group by state
        const byState = {};
        for (const r of results) {
            const state = r.prop('state')?.choice() || 'Unknown';
            if (!byState[state]) byState[state] = [];
            byState[state].push({
                guid: r.guid,
                title: r.getName(),
                repo: r.text('repo'),
                type: r.prop('type')?.choice()
            });
        }

        return {
            total: results.length,
            by_state: byState
        };
    }
}
