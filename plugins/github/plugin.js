const VERSION = 'v0.9.0';
/**
 * GitHub Sync - App Plugin
 *
 * Syncs issues and PRs from GitHub into the Issues collection.
 * Registers with Sync Hub for scheduled syncing.
 */

class Plugin extends AppPlugin {

    async onLoad() {
        // Listen for Sync Hub ready event (handles reloads)
        this.syncHubReadyHandler = () => this.registerWithSyncHub();
        window.addEventListener('synchub-ready', this.syncHubReadyHandler);

        // Also check if Sync Hub is already ready
        if (window.syncHub) {
            this.registerWithSyncHub();
        }
    }

    onUnload() {
        if (this.syncHubReadyHandler) {
            window.removeEventListener('synchub-ready', this.syncHubReadyHandler);
        }
        if (window.syncHub) {
            window.syncHub.unregister('github-sync');
        }
    }

    async registerWithSyncHub() {
        console.log('[GitHub] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'github-sync',
            name: 'GitHub',
            icon: 'ti-brand-github',
            defaultInterval: '5m',
            version: VERSION,
            sync: async (ctx) => this.sync(ctx),
        });
        console.log('[GitHub] Registered successfully');
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
            debug('GitHub Sync record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0, changes: [] };
        }

        const token = myRecord.text('token');
        const configJson = myRecord.text('config');
        const lastRun = myRecord.prop('last_run')?.date();

        if (!token) {
            debug('No GitHub token configured');
            return { summary: 'No token', created: 0, updated: 0, changes: [] };
        }

        // Parse config (projects mapping, query)
        let config = {};
        try {
            config = configJson ? JSON.parse(configJson) : {};
        } catch (e) {
            debug('Invalid config JSON, using defaults');
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
            debug('No repos or query configured');
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
