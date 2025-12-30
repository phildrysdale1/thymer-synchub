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

        // Wait for Sync Hub to be available
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

    waitForSyncHub() {
        if (window.syncHub) {
            this.registerWithSyncHub();
        } else {
            setTimeout(() => this.waitForSyncHub(), 1000);
        }
    }

    async registerWithSyncHub() {
        await window.syncHub.register({
            id: 'github-sync',
            name: 'GitHub',
            icon: 'ti-brand-github',
            defaultInterval: '5m',
            sync: async (ctx) => this.sync(ctx),
        });
    }

    // =========================================================================
    // Sync Logic
    // =========================================================================

    async sync({ data, ui, log, debug }) {
        // Get our config from the Sync Hub record
        const status = await window.syncHub.getStatus('github-sync');
        if (!status) {
            log('No config found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        // Find our Sync Hub record to get token and config
        const collections = await data.getAllCollections();
        const syncHubCollection = collections.find(c => c.getName() === 'Sync Hub');

        if (!syncHubCollection) {
            log('Sync Hub collection not found');
            return { summary: 'Sync Hub not found', created: 0, updated: 0 };
        }

        const syncHubRecords = await syncHubCollection.getAllRecords();
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'github-sync');

        if (!myRecord) {
            log('GitHub Sync record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        const token = myRecord.text('token');
        const configJson = myRecord.text('config');
        const lastRun = myRecord.prop('last_run')?.date();

        if (!token) {
            log('No GitHub token configured');
            return { summary: 'No token', created: 0, updated: 0 };
        }

        // Parse config (repos, query)
        let config = {};
        try {
            config = configJson ? JSON.parse(configJson) : {};
        } catch (e) {
            log('Invalid config JSON, using defaults');
        }

        const repos = config.repos || [];
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
            return { summary: 'No repos configured', created: 0, updated: 0 };
        }

        // Find the Issues collection
        const issuesCollection = collections.find(c => c.getName() === 'Issues');

        if (!issuesCollection) {
            log('Issues collection not found');
            return { summary: 'Issues collection not found', created: 0, updated: 0 };
        }

        let totalCreated = 0;
        let totalUpdated = 0;

        // Sync from search query
        if (query) {
            debug(`Searching: ${query}`);
            const result = await this.syncFromSearch(token, query, issuesCollection, data, { log, debug, since });
            totalCreated += result.created;
            totalUpdated += result.updated;
        }

        // Sync from specific repos
        for (const repo of repos) {
            debug(`Fetching: ${repo}`);
            const result = await this.syncFromRepo(token, repo, issuesCollection, data, { log, debug, since });
            totalCreated += result.created;
            totalUpdated += result.updated;
        }

        const summary = totalCreated > 0 || totalUpdated > 0
            ? `${totalCreated} new, ${totalUpdated} updated`
            : 'No changes';

        return {
            summary,
            created: totalCreated,
            updated: totalUpdated,
            journalEntry: totalCreated > 0 ? `GitHub: ${totalCreated} new issues` : null,
        };
    }

    // =========================================================================
    // GitHub API
    // =========================================================================

    async syncFromSearch(token, query, issuesCollection, data, { log, debug, since }) {
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
            return await this.processIssues(result.items || [], issuesCollection, data, { log, debug });
        } catch (error) {
            log(`Search failed: ${error.message}`);
            return { created: 0, updated: 0 };
        }
    }

    async syncFromRepo(token, repo, issuesCollection, data, { log, debug, since }) {
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
            return await this.processIssues(issues, issuesCollection, data, { log, debug });
        } catch (error) {
            log(`Repo ${repo} failed: ${error.message}`);
            return { created: 0, updated: 0 };
        }
    }

    async processIssues(issues, issuesCollection, data, { log, debug }) {
        let created = 0;
        let updated = 0;

        const existingRecords = await issuesCollection.getAllRecords();

        for (const issue of issues) {
            const externalId = `github_${issue.id}`;
            const existingRecord = existingRecords.find(r => r.text('external_id') === externalId);

            // Extract repo from URL
            const urlParts = issue.html_url.split('/');
            const repoIndex = urlParts.indexOf('github.com') + 1;
            const repo = `${urlParts[repoIndex]}/${urlParts[repoIndex + 1]}`;

            const issueData = {
                external_id: externalId,
                title: issue.title,
                source: 'GitHub',  // Label, not ID
                repo: repo,
                number: issue.number,
                type: issue.pull_request ? 'PR' : 'Issue',  // Labels from schema
                state: issue.state === 'open' ? 'Open' : 'Closed',  // Labels from schema
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
                    this.updateRecord(existingRecord, issueData);
                    updated++;
                    debug(`Updated: ${issue.title}`);
                }
            } else {
                await this.createRecord(issuesCollection, data, issueData);
                created++;
                debug(`Created: ${issue.title}`);
            }
        }

        return { created, updated };
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

    updateRecord(record, issueData) {
        this.setRecordFields(record, issueData);
    }

    setRecordFields(record, data) {
        this.setField(record, 'external_id', data.external_id);
        this.setField(record, 'source', data.source);
        this.setField(record, 'repo', data.repo);
        this.setField(record, 'number', data.number);
        this.setField(record, 'type', data.type);
        this.setField(record, 'state', data.state);
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
