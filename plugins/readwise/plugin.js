const VERSION = 'v1.0.3';
/**
 * Readwise Sync - App Plugin
 *
 * Syncs documents and highlights from Readwise Reader into the Readwise collection.
 * Groups highlights by document - one record per book/article.
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
        if (window.syncHub) window.syncHub.unregister('readwise-sync');
    }

    async registerWithSyncHub() {
        console.log('[Readwise] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'readwise-sync',
            name: 'Readwise',
            icon: 'ti-books',
            defaultInterval: '1h',
            version: VERSION,
            sync: async (ctx) => this.sync(ctx),
        });
        console.log('[Readwise] Registered successfully');
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
            return { summary: 'Sync Hub not found', created: 0, updated: 0 };
        }

        const syncHubRecords = await syncHubCollection.getAllRecords();
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'readwise-sync');

        if (!myRecord) {
            debug('Readwise Sync record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        const token = myRecord.text('token');
        const lastRun = myRecord.prop('last_run')?.date();

        if (!token) {
            debug('No Readwise token configured');
            return { summary: 'No token', created: 0, updated: 0 };
        }

        // Find the Captures collection
        const capturesCollection = collections.find(c => c.getName() === 'Captures');

        if (!capturesCollection) {
            log('Captures collection not found');
            return { summary: 'Captures collection not found', created: 0, updated: 0 };
        }

        // Check if collection is empty - if so, force full sync
        const existingRecords = await capturesCollection.getAllRecords();
        const collectionEmpty = existingRecords.length === 0;

        // Determine since date for incremental sync
        // Force full sync if: explicitly requested, no last_run, or collection is empty
        const since = (lastRun && !this.forceFullSync && !collectionEmpty) ? lastRun.toISOString() : null;
        if (this.forceFullSync) {
            debug('Full sync (forced)');
        } else if (collectionEmpty) {
            debug('Full sync (collection empty)');
        } else if (since) {
            debug(`Incremental sync since: ${since}`);
        } else {
            debug('Full sync (no last_run)');
        }

        // Fetch documents and highlights from Readwise API
        debug('Fetching from Readwise API...');
        const { documents, highlights } = await this.fetchFromReadwise(token, since, { log, debug });

        if (documents.length === 0) {
            debug('No documents returned');
            return { summary: 'No changes', created: 0, updated: 0 };
        }

        debug(`Fetched ${documents.length} documents, ${highlights.length} highlights`);

        // Group highlights by parent document
        const highlightsByDoc = new Map();
        for (const h of highlights) {
            if (h.parent_id) {
                if (!highlightsByDoc.has(h.parent_id)) {
                    highlightsByDoc.set(h.parent_id, []);
                }
                highlightsByDoc.get(h.parent_id).push(h);
            }
        }

        // Process documents
        let created = 0;
        let updated = 0;
        const changes = [];

        for (const doc of documents) {
            // Skip RSS feeds (too noisy, like Go version)
            if (doc.category === 'rss') continue;

            const docHighlights = highlightsByDoc.get(doc.id) || [];

            // Skip documents without highlights
            if (docHighlights.length === 0) continue;

            const externalId = `readwise_${doc.id}`;
            const existingRecord = existingRecords.find(r => r.text('external_id') === externalId);

            const docData = {
                external_id: externalId,
                title: doc.title || 'Untitled',
                source: 'Readwise',
                source_title: doc.title || 'Untitled',
                source_author: doc.author || '',
                source_url: doc.source_url || '',
                highlight_count: docHighlights.length,
                captured_at: doc.created_at,
            };

            if (existingRecord) {
                // Check if new highlights were added
                const oldCount = existingRecord.prop('highlight_count')?.value || 0;
                const newCount = docHighlights.length;
                const hasNewHighlights = newCount > oldCount;

                this.updateRecord(existingRecord, docData);
                await this.updateHighlights(existingRecord, doc, docHighlights);
                updated++;
                debug(`Updated: ${doc.title} (${oldCount} -> ${newCount} highlights)`);

                // Only log if new highlights were added
                if (hasNewHighlights) {
                    // Extract highlight texts for verbose journal (only new ones)
                    const highlightTexts = docHighlights
                        .map(h => h.content?.trim())
                        .filter(t => t && t.length > 0)
                        .slice(0, 5); // Limit to 5 highlights per entry

                    changes.push({
                        verb: 'highlighted',
                        title: doc.title || 'Untitled',
                        guid: existingRecord.guid,
                        major: false,  // Additional highlights are minor
                        children: highlightTexts,
                    });
                }
            } else {
                // Create new - major change (first highlight for document)
                const record = await this.createRecord(capturesCollection, data, docData);
                if (record) {
                    await this.insertHighlights(record, doc, docHighlights);
                    created++;
                    debug(`Created: ${doc.title}`);

                    // Extract highlight texts for verbose journal
                    const highlightTexts = docHighlights
                        .map(h => h.content?.trim())
                        .filter(t => t && t.length > 0)
                        .slice(0, 5); // Limit to 5 highlights per entry

                    changes.push({
                        verb: 'highlighted',
                        title: doc.title || 'Untitled',
                        guid: record.guid,
                        major: true,  // First highlight is major
                        children: highlightTexts,
                    });
                }
            }
        }

        const summary = created > 0 || updated > 0
            ? `${created} new, ${updated} updated`
            : 'No changes';

        return {
            summary,
            created,
            updated,
            changes,
        };
    }

    // =========================================================================
    // Readwise API
    // =========================================================================

    async fetchFromReadwise(token, since, { log, debug }) {
        const documents = [];
        const highlights = [];
        let pageCursor = null;

        while (true) {
            let url = 'https://readwise.io/api/v3/list/?';
            if (since) {
                url += `updatedAfter=${encodeURIComponent(since)}&`;
            }
            if (pageCursor) {
                url += `pageCursor=${encodeURIComponent(pageCursor)}`;
            }

            try {
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Token ${token}`,
                    },
                });

                if (response.status === 429) {
                    // Rate limited
                    const retryAfter = response.headers.get('Retry-After') || '60';
                    const waitMs = parseInt(retryAfter, 10) * 1000;
                    debug(`Rate limited, waiting ${retryAfter}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`Readwise API error: ${response.status}`);
                }

                const data = await response.json();

                // Separate documents from highlights
                for (const item of data.results || []) {
                    if (item.parent_id) {
                        highlights.push(item);
                    } else {
                        documents.push(item);
                    }
                }

                if (!data.nextPageCursor) {
                    break;
                }
                pageCursor = data.nextPageCursor;

            } catch (error) {
                log(`Readwise API failed: ${error.message}`);
                break;
            }
        }

        return { documents, highlights };
    }

    capitalizeCategory(category) {
        if (!category) return '';
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    // =========================================================================
    // Record Management
    // =========================================================================

    async createRecord(collection, data, docData) {
        const recordGuid = collection.createRecord(docData.title);
        if (!recordGuid) return null;

        // Wait for record to sync
        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await collection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) return null;

        this.setRecordFields(record, docData);
        return record;
    }

    updateRecord(record, docData) {
        this.setRecordFields(record, docData);
    }

    setRecordFields(record, data) {
        this.setField(record, 'external_id', data.external_id);
        this.setField(record, 'source', data.source);
        this.setField(record, 'source_title', data.source_title);
        this.setField(record, 'source_author', data.source_author);
        this.setField(record, 'source_url', data.source_url);
        this.setField(record, 'highlight_count', data.highlight_count);
        if (data.captured_at) this.setField(record, 'captured_at', new Date(data.captured_at));
    }

    setField(record, fieldId, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return;

            if (typeof value === 'string') {
                if (typeof prop.setChoice === 'function') {
                    const success = prop.setChoice(value);
                    if (!success) prop.set(value);
                } else {
                    prop.set(value);
                }
            } else {
                prop.set(value);
            }
        } catch (e) {
            // Skip silently
        }
    }

    // =========================================================================
    // Highlight Rendering
    // =========================================================================

    async insertHighlights(record, doc, highlights) {
        if (!window.syncHub?.insertMarkdown) return;

        const markdown = this.buildHighlightsMarkdown(doc, highlights);
        if (markdown) {
            await window.syncHub.insertMarkdown(markdown, record, null);
        }
    }

    async updateHighlights(record, doc, highlights) {
        if (!window.syncHub?.replaceContents) return;

        const markdown = this.buildHighlightsMarkdown(doc, highlights);
        if (markdown) {
            await window.syncHub.replaceContents(markdown, record);
        }
    }

    buildHighlightsMarkdown(doc, highlights) {
        const parts = [];

        // Summary section
        if (doc.summary) {
            parts.push('## Summary\n');
            parts.push(doc.summary);
            parts.push('');
        }

        // Highlights section
        if (highlights.length > 0) {
            parts.push('## Highlights\n');
            for (const h of highlights) {
                // Blockquote the highlight
                const quoted = h.content
                    ? h.content.split('\n').map(line => `> ${line}`).join('\n')
                    : '';
                parts.push(quoted);

                // Add note if present
                if (h.note) {
                    parts.push('');
                    parts.push(`**Note:** ${h.note}`);
                }
                parts.push('');
            }
        }

        return parts.join('\n');
    }
}
