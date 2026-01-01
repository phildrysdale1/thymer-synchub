/**
 * GitHub Sync - App Plugin
 *
 * Syncs issues and PRs from GitHub into the Issues collection.
 * Registers with Sync Hub for scheduled syncing.
 */

class Plugin extends AppPlugin {

    async onLoad() {
        // Command palette: Full Sync (ignores last_run)
        this.fullSyncCommand = this.ui.addCommandPaletteCommand({
            label: 'GitHub Full Sync',
            icon: 'brand-github',
            onSelected: () => this.triggerSync(true)
        });

        // Command palette: Incremental Sync (uses last_run)
        this.incrementalSyncCommand = this.ui.addCommandPaletteCommand({
            label: 'GitHub Incremental Sync',
            icon: 'brand-github',
            onSelected: () => this.triggerSync(false)
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
        if (this.fullSyncCommand) {
            this.fullSyncCommand.remove();
        }
        if (this.incrementalSyncCommand) {
            this.incrementalSyncCommand.remove();
        }
        if (this.syncHubReadyHandler) {
            window.removeEventListener('synchub-ready', this.syncHubReadyHandler);
        }
        if (window.syncHub) {
            window.syncHub.unregister('github-sync');
        }
    }

    async triggerSync(forceFullSync = false) {
        this.forceFullSync = forceFullSync;
        if (window.syncHub) {
            await window.syncHub.requestSync('github-sync');
        }
        this.forceFullSync = false;
    }

    async registerWithSyncHub() {
        console.log('[GitHub] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'github-sync',
            name: 'GitHub',
            icon: 'ti-brand-github',
            defaultInterval: '5m',
            sync: async (ctx) => this.sync(ctx),
        });

        // Register collection tools for agents
        this.registerCollectionTools();

        console.log('[GitHub] Registered successfully');
    }

    registerCollectionTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'Issues',
            description: 'GitHub/GitLab issues and pull requests',
            schema: {
                title: 'Issue title',
                state: 'Open | In Progress | Closed',
                type: 'Issue | PR',
                repo: 'Repository name (owner/repo)',
                assignee: 'Assigned user',
                author: 'Issue author',
                number: 'Issue number',
                url: 'Link to issue on GitHub'
            },
            tools: [
                {
                    name: 'find',
                    description: 'Find issues by state, repo, or assignee. Returns GUIDs - use [[GUID]] in your response to create clickable links.',
                    parameters: {
                        state: { type: 'string', enum: ['Open', 'In Progress', 'Closed'], optional: true },
                        repo: { type: 'string', description: 'Repository name (e.g. owner/repo)', optional: true },
                        assignee: { type: 'string', optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolFindIssues(args, data)
                },
                {
                    name: 'get',
                    description: 'Get full details of an issue by number or title. Returns GUID - use [[GUID]] to link.',
                    parameters: { query: 'string' },
                    handler: async (args, data) => this.toolGetIssue(args, data)
                },
                {
                    name: 'set_state',
                    description: 'Change the workflow state of an issue',
                    parameters: {
                        issue: 'string',
                        state: { type: 'string', enum: ['Open', 'In Progress', 'Closed'] }
                    },
                    handler: async (args, data) => this.toolSetIssueState(args, data)
                },
                {
                    name: 'summarize_open',
                    description: 'Summarize all open issues. Returns GUIDs - use [[GUID]] in your response to create clickable links to each issue.',
                    parameters: { repo: 'string?' },
                    handler: async (args, data) => this.toolSummarizeOpen(args, data)
                }
            ]
        });
    }

    // =========================================================================
    // Agent Tool Handlers
    // =========================================================================

    async toolFindIssues({ state, repo, assignee, limit = 10 }, data) {
        try {
            const collections = await data.getAllCollections();
            const issuesCollection = collections.find(c => c.getName() === 'Issues');
            if (!issuesCollection) return { error: 'Issues collection not found' };

            let records = await issuesCollection.getAllRecords();

            // Apply filters
            if (state) {
                records = records.filter(r => {
                    const s = r.prop('state')?.choice();
                    return s?.toLowerCase().includes(state.toLowerCase());
                });
            }
            if (repo) {
                records = records.filter(r => {
                    const rp = r.prop('repo')?.text();
                    return rp?.toLowerCase().includes(repo.toLowerCase());
                });
            }
            if (assignee) {
                records = records.filter(r => {
                    const a = r.prop('assignee')?.text();
                    return a?.toLowerCase().includes(assignee.toLowerCase());
                });
            }

            return {
                count: records.length,
                issues: records.slice(0, limit).map(r => ({
                    guid: r.guid,
                    title: r.getName(),
                    state: r.prop('state')?.choice(),
                    repo: r.prop('repo')?.text(),
                    number: r.prop('number')?.number(),
                    assignee: r.prop('assignee')?.text()
                }))
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolGetIssue({ query }, data) {
        try {
            const collections = await data.getAllCollections();
            const issuesCollection = collections.find(c => c.getName() === 'Issues');
            if (!issuesCollection) return { error: 'Issues collection not found' };

            const records = await issuesCollection.getAllRecords();

            // Try to find by number first, then by title
            let record = records.find(r => {
                const num = r.prop('number')?.number();
                return num && num.toString() === query;
            });

            if (!record) {
                record = records.find(r =>
                    r.getName()?.toLowerCase().includes(query.toLowerCase())
                );
            }

            if (!record) return { error: `Issue not found: ${query}` };

            // Get body content
            const lineItems = await record.getLineItems?.() || [];
            const body = lineItems
                .filter(item => item.parent_guid === record.guid)
                .map(item => item.segments?.map(s => s.text).join('') || '')
                .join('\n');

            return {
                guid: record.guid,
                title: record.getName(),
                state: record.prop('state')?.choice(),
                type: record.prop('type')?.choice(),
                repo: record.prop('repo')?.text(),
                number: record.prop('number')?.number(),
                author: record.prop('author')?.text(),
                assignee: record.prop('assignee')?.text(),
                url: record.prop('url')?.text(),
                body: body || '(empty)'
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolSetIssueState({ issue, state }, data) {
        try {
            const collections = await data.getAllCollections();
            const issuesCollection = collections.find(c => c.getName() === 'Issues');
            if (!issuesCollection) return { error: 'Issues collection not found' };

            const records = await issuesCollection.getAllRecords();
            let record = records.find(r => {
                const num = r.prop('number')?.number();
                return num && num.toString() === issue;
            }) || records.find(r =>
                r.getName()?.toLowerCase().includes(issue.toLowerCase())
            );

            if (!record) return { error: `Issue not found: ${issue}` };

            // Set state (try to match choice label)
            const prop = record.prop('state');
            if (!prop) return { error: 'State field not found' };

            const success = prop.setChoice(state);
            if (!success) {
                // Try common variations
                const variations = ['Open', 'In Progress', 'Closed'];
                const match = variations.find(v => v.toLowerCase() === state.toLowerCase());
                if (match) prop.setChoice(match);
            }

            return { success: true, issue: record.getName(), newState: state };
        } catch (e) {
            return { error: e.message };
        }
    }

    async toolSummarizeOpen({ repo }, data) {
        try {
            const result = await this.toolFindIssues({ state: 'Open', repo, limit: 50 }, data);
            if (result.error) return result;

            const byRepo = {};
            for (const issue of result.issues) {
                const r = issue.repo || 'Unknown';
                if (!byRepo[r]) byRepo[r] = [];
                byRepo[r].push(issue.title);
            }

            return {
                totalOpen: result.count,
                byRepo: Object.entries(byRepo).map(([repo, issues]) => ({
                    repo,
                    count: issues.length,
                    issues: issues.slice(0, 5)
                }))
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    // =========================================================================
    // Sync Logic
    // =========================================================================

    async sync({ data, ui, log, debug }) {
        // Get our config from the Sync Hub record
        const status = await window.syncHub.getStatus('github-sync');
        if (!status) {
            log('No config found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        // Find our Sync Hub record to get token and config
        const collections = await data.getAllCollections();
        const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');

        if (!syncHubCollection) {
            log('Sync Hub collection not found');
            return { summary: 'Sync Hub not found', created: 0, updated: 0, changes: [] };
        }

        const syncHubRecords = await syncHubCollection.getAllRecords();
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'github-sync');

        if (!myRecord) {
            log('GitHub Sync record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        const token = myRecord.text('token');
        const configJson = myRecord.text('config');
        const lastRun = myRecord.prop('last_run')?.date();

        if (!token) {
            log('No GitHub token configured');
            return { summary: 'No token', created: 0, updated: 0, changes: [] };
        }

        // Parse config (projects mapping, query)
        let config = {};
        try {
            config = configJson ? JSON.parse(configJson) : {};
        } catch (e) {
            log('Invalid config JSON, using defaults');
        }

        // Support both old format (repos array) and new format (projects mapping)
        const projectsMapping = config.projects || {};
        const repos = Object.keys(projectsMapping).length > 0
            ? Object.keys(projectsMapping)
            : (config.repos || []);
        const query = config.query || '';

        // Format last_run for GitHub API (ISO 8601)
        // Skip if forceFullSync is set (via command palette)
        const since = (lastRun && !this.forceFullSync) ? lastRun.toISOString() : null;
        if (this.forceFullSync) {
            debug('Full sync (forced)');
        } else if (since) {
            debug(`Incremental sync since: ${since}`);
        } else {
            debug('Full sync (no last_run)');
        }

        if (repos.length === 0 && !query) {
            log('No repos or query configured');
            return { summary: 'No repos configured', created: 0, updated: 0, changes: [] };
        }

        // Find the Issues collection
        const issuesCollection = collections.find(c => c.getName() === 'Issues');

        if (!issuesCollection) {
            log('Issues collection not found');
            return { summary: 'Issues collection not found', created: 0, updated: 0, changes: [] };
        }

        let totalCreated = 0;
        let totalUpdated = 0;
        let allChanges = [];

        // Sync from search query
        if (query) {
            debug(`Searching: ${query}`);
            const result = await this.syncFromSearch(token, query, issuesCollection, data, { log, debug, since, projectsMapping });
            totalCreated += result.created;
            totalUpdated += result.updated;
            allChanges = allChanges.concat(result.changes || []);
        }

        // Sync from specific repos
        for (const repo of repos) {
            debug(`Fetching: ${repo}`);
            const result = await this.syncFromRepo(token, repo, issuesCollection, data, { log, debug, since, projectsMapping });
            totalCreated += result.created;
            totalUpdated += result.updated;
            allChanges = allChanges.concat(result.changes || []);
        }

        const summary = totalCreated > 0 || totalUpdated > 0
            ? `${totalCreated} new, ${totalUpdated} updated`
            : 'No changes';

        return {
            summary,
            created: totalCreated,
            updated: totalUpdated,
            changes: allChanges,
        };
    }

    // =========================================================================
    // GitHub API
    // =========================================================================

    async syncFromSearch(token, query, issuesCollection, data, { log, debug, since, projectsMapping }) {
        // GitHub search API uses updated:>=YYYY-MM-DD for incremental sync
        let effectiveQuery = query;
        if (since) {
            const sinceDate = since.split('T')[0]; // YYYY-MM-DD
            effectiveQuery = `${query} updated:>=${sinceDate}`;
        }
        const url = `https://api.github.com/search/issues?q=${encodeURIComponent(effectiveQuery)}&per_page=100`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const result = await response.json();
            return await this.processIssues(result.items || [], issuesCollection, data, { log, debug, projectsMapping });
        } catch (error) {
            log(`Search failed: ${error.message}`);
            return { created: 0, updated: 0 };
        }
    }

    async syncFromRepo(token, repo, issuesCollection, data, { log, debug, since, projectsMapping }) {
        // GitHub API supports since parameter for incremental sync
        let url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`;
        if (since) {
            url += `&since=${encodeURIComponent(since)}`;
        }

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const issues = await response.json();
            return await this.processIssues(issues, issuesCollection, data, { log, debug, projectsMapping });
        } catch (error) {
            log(`Repo ${repo} failed: ${error.message}`);
            return { created: 0, updated: 0 };
        }
    }

    async processIssues(issues, issuesCollection, data, { log, debug, projectsMapping = {} }) {
        let created = 0;
        let updated = 0;
        const changes = [];

        const existingRecords = await issuesCollection.getAllRecords();

        for (const issue of issues) {
            const externalId = `github_${issue.id}`;
            const existingRecord = existingRecords.find(r => r.text('external_id') === externalId);

            // Extract repo from URL
            const urlParts = issue.html_url.split('/');
            const repoIndex = urlParts.indexOf('github.com') + 1;
            const repo = `${urlParts[repoIndex]}/${urlParts[repoIndex + 1]}`;

            // Look up project from mapping (try full path, then just repo name)
            const project = projectsMapping[repo] || projectsMapping[repo.split('/')[1]] || null;

            const isPR = !!issue.pull_request;
            const isMerged = isPR && issue.pull_request?.merged_at;
            const githubState = issue.state; // 'open' or 'closed'

            const issueData = {
                external_id: externalId,
                title: issue.title,
                source: 'GitHub',
                repo: repo,
                project: project,
                number: issue.number,
                type: isPR ? 'PR' : 'Issue',
                // state computed below based on context
                author: issue.user?.login || '',
                assignee: issue.assignee?.login || '',
                url: issue.html_url,
                body: issue.body || '',
                created_at: issue.created_at,
                updated_at: issue.updated_at,
            };

            if (existingRecord) {
                // Check if needs update
                const currentUpdatedAt = existingRecord.text('updated_at');
                if (currentUpdatedAt !== issue.updated_at) {
                    const oldState = existingRecord.prop('state')?.choice();

                    // Smart state handling:
                    // - GitHub closed → always set to Closed (unless user set Cancelled)
                    // - GitHub open → only change if was Closed (reopened), preserve Next/In Progress
                    const closedStates = ['Closed', 'Cancelled'];
                    const openStates = ['Open', 'Next', 'In Progress'];

                    let newState = null;
                    let stateChanged = false;

                    if (githubState === 'closed') {
                        // Only update to Closed if not already in a closed state
                        if (!closedStates.includes(oldState)) {
                            newState = 'Closed';
                            stateChanged = true;
                        }
                    } else {
                        // GitHub is open - only change if currently closed (reopened)
                        if (closedStates.includes(oldState)) {
                            newState = 'Open';
                            stateChanged = true;
                        }
                        // Otherwise preserve user's workflow state (Next, In Progress)
                    }

                    if (newState) {
                        issueData.state = newState;
                    }

                    let verb, major;
                    if (stateChanged) {
                        verb = this.stateToVerb(newState, isMerged);
                        major = true;  // State changes are major
                    } else {
                        verb = 'edited';
                        major = false;  // Just edits are minor
                    }

                    await this.updateRecord(existingRecord, issueData);
                    updated++;
                    debug(`Updated: ${issue.title}`);

                    changes.push({
                        verb,
                        title: issue.title,
                        guid: existingRecord.guid,
                        major,
                    });
                }
            } else {
                // New record - set initial state from GitHub
                const initialState = githubState === 'open' ? 'Open' : 'Closed';
                issueData.state = initialState;

                const record = await this.createRecord(issuesCollection, data, issueData);
                created++;
                debug(`Created: ${issue.title}`);

                if (record) {
                    const verb = this.stateToVerb(initialState, isMerged);
                    changes.push({
                        verb,
                        title: issue.title,
                        guid: record.guid,
                        major: true,  // New records are always major
                    });
                }
            }
        }

        return { created, updated, changes };
    }

    stateToVerb(state, merged) {
        if (merged) return 'merged';
        if (state === 'Open') return 'opened';
        if (state === 'Closed') return 'closed';
        return 'updated';
    }

    // =========================================================================
    // Record Management
    // =========================================================================

    async createRecord(issuesCollection, data, issueData) {
        const recordGuid = issuesCollection.createRecord(issueData.title);
        if (!recordGuid) return null;

        // Brief delay for sync, then find record in collection
        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await issuesCollection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) {
            return null;
        }

        this.setRecordFields(record, issueData);

        // Insert body as markdown content
        if (issueData.body && window.syncHub?.insertMarkdown) {
            await window.syncHub.insertMarkdown(issueData.body, record, null);
        }

        return record;
    }

    async updateRecord(record, issueData) {
        this.setRecordFields(record, issueData);

        // Update body content via SyncHub
        if (issueData.body && window.syncHub?.replaceContents) {
            await window.syncHub.replaceContents(issueData.body, record);
        }
    }

    setRecordFields(record, data) {
        this.setField(record, 'external_id', data.external_id);
        this.setField(record, 'source', data.source);
        this.setField(record, 'repo', data.repo);
        if (data.project) {
            this.setField(record, 'project', data.project);
        }
        this.setField(record, 'number', data.number);
        this.setField(record, 'type', data.type);
        if (data.state) {
            this.setField(record, 'state', data.state);
        }
        this.setField(record, 'author', data.author);
        this.setField(record, 'assignee', data.assignee);
        this.setField(record, 'url', data.url);
        this.setField(record, 'created_at', new Date(data.created_at));
        this.setField(record, 'updated_at', new Date(data.updated_at));
    }

    setField(record, fieldId, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return;

            if (typeof value === 'string') {
                // Try setChoice first for choice fields (matches by label)
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
            // Field doesn't exist or can't be set, skip silently
        }
    }

}
