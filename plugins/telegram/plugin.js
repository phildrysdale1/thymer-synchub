/**
 * Telegram Sync - App Plugin
 *
 * Polls Telegram Bot API for messages and routes them to appropriate collections.
 * Smart routing: one-liners → Journal, markdown → Captures, GitHub URLs → Issues, etc.
 *
 * Setup:
 * 1. Message @BotFather on Telegram: /newbot
 * 2. Copy the bot token
 * 3. In Thymer Sync Hub, find Telegram record
 * 4. Paste token into config field as: {"bot_token": "YOUR_TOKEN"}
 */

class Plugin extends AppPlugin {

    async onLoad() {
        // Command palette: Manual sync
        this.syncCommand = this.ui.addCommandPaletteCommand({
            label: 'Telegram Sync',
            icon: 'brand-telegram',
            onSelected: () => this.triggerSync()
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
        if (this.syncCommand) {
            this.syncCommand.remove();
        }
        if (this.syncHubReadyHandler) {
            window.removeEventListener('synchub-ready', this.syncHubReadyHandler);
        }
        if (window.syncHub) {
            window.syncHub.unregister('telegram-sync');
        }
    }

    async triggerSync() {
        if (window.syncHub) {
            await window.syncHub.requestSync('telegram-sync');
        }
    }

    async registerWithSyncHub() {
        console.log('[Telegram] Registering with Sync Hub...');
        await window.syncHub.register({
            id: 'telegram-sync',
            name: 'Telegram',
            icon: 'ti-brand-telegram',
            defaultInterval: '1m',
            sync: async (ctx) => this.sync(ctx),
        });
        console.log('[Telegram] Registered successfully');
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
        const myRecord = syncHubRecords.find(r => r.text('plugin_id') === 'telegram-sync');

        if (!myRecord) {
            log('Telegram Sync record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        // Get bot token
        const botToken = myRecord.text('token');
        if (!botToken) {
            log('No bot token. Add your Telegram bot token to the Token field.');
            return { summary: 'Not configured - add bot token', created: 0, updated: 0 };
        }

        // Parse config for additional settings (like last_offset)
        let config = {};
        const configText = myRecord.text('config');
        if (configText) {
            try {
                config = JSON.parse(configText);
            } catch (e) {
                // Ignore invalid JSON, use empty config
            }
        }

        // Get last processed update offset
        const lastOffset = config.last_offset || 0;

        debug(`Polling Telegram (offset: ${lastOffset})...`);

        // Fetch updates from Telegram
        let updates;
        try {
            const response = await fetch(
                `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastOffset}&timeout=0`
            );
            const result = await response.json();

            if (!result.ok) {
                log(`Telegram API error: ${result.description}`);
                return { summary: `API error: ${result.description}`, created: 0, updated: 0 };
            }

            updates = result.result || [];
        } catch (e) {
            log(`Fetch error: ${e.message}`);
            return { summary: `Fetch error: ${e.message}`, created: 0, updated: 0 };
        }

        if (updates.length === 0) {
            debug('No new messages');
            return { summary: 'No new messages', created: 0, updated: 0 };
        }

        debug(`Found ${updates.length} message(s)`);

        // Process each message
        let created = 0;
        const changes = [];

        for (const update of updates) {
            const message = update.message;
            if (!message) continue;

            try {
                const result = await this.routeMessage(message, data, log, debug);
                if (result) {
                    created++;
                    changes.push(result);
                }
            } catch (e) {
                log(`Error processing message: ${e.message}`);
            }
        }

        // Update offset to mark messages as processed
        if (updates.length > 0) {
            const newOffset = updates[updates.length - 1].update_id + 1;
            config.last_offset = newOffset;
            myRecord.prop('config')?.set(JSON.stringify(config));
            debug(`Updated offset to ${newOffset}`);
        }

        return {
            summary: `${created} message(s) routed`,
            created,
            updated: 0,
            changes
        };
    }

    // =========================================================================
    // Message Routing
    // =========================================================================

    async routeMessage(message, data, log, debug) {
        const text = message.text || message.caption || '';
        const timestamp = new Date(message.date * 1000);
        const timeStr = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        debug(`Routing: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // Photo handling (future: store photo)
        if (message.photo) {
            return this.handlePhoto(message, data, timeStr, log, debug);
        }

        // URL detection and special handling
        if (text.trim() && this.isUrl(text.trim())) {
            const url = text.trim();

            // GitHub issue/PR URL
            if (this.isGitHubIssueUrl(url)) {
                return this.handleGitHubUrl(url, data, timeStr, log, debug);
            }

            // iCal URL
            if (this.isICalUrl(url)) {
                return this.handleICalUrl(url, data, timeStr, log, debug);
            }

            // Regular web URL - fetch and capture
            return this.handleWebUrl(url, data, timeStr, log, debug);
        }

        // Text-based routing (from legacy plugin patterns)
        return this.handleText(text, data, timeStr, log, debug);
    }

    // =========================================================================
    // URL Handlers
    // =========================================================================

    isUrl(text) {
        return /^https?:\/\/\S+$/i.test(text);
    }

    isGitHubIssueUrl(url) {
        return /github\.com\/[^\/]+\/[^\/]+\/(issues|pull)\/\d+/.test(url);
    }

    isICalUrl(url) {
        return /\.ics(\?|$)/i.test(url) || /webcal:\/\//i.test(url);
    }

    async handleGitHubUrl(url, data, timeStr, log, debug) {
        // Extract issue info from URL
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/);
        if (!match) return null;

        const [, owner, repo, type, number] = match;
        const title = `${owner}/${repo}#${number}`;

        debug(`GitHub ${type}: ${title}`);

        // For now, just add to journal with link
        // Future: actually fetch issue details and add to Issues collection
        const journal = await this.getTodayJournalRecord(data);
        if (!journal) {
            log('Could not find Journal');
            return null;
        }

        await this.appendOneLiner(journal, timeStr, `${type === 'pull' ? 'PR' : 'Issue'}: [${title}](${url})`);

        return {
            verb: 'captured',
            title: title,
            guid: journal.guid,
            major: false
        };
    }

    async handleICalUrl(url, data, timeStr, log, debug) {
        debug(`iCal URL: ${url}`);

        // For now, just capture as a link
        // Future: parse iCal and add events to Calendar
        const journal = await this.getTodayJournalRecord(data);
        if (!journal) return null;

        await this.appendOneLiner(journal, timeStr, `Calendar: ${url}`);

        return {
            verb: 'captured',
            title: 'Calendar link',
            guid: journal.guid,
            major: false
        };
    }

    async handleWebUrl(url, data, timeStr, log, debug) {
        debug(`Web URL: ${url}`);

        // Find Captures collection (fallback to Inbox)
        const collections = await data.getAllCollections();
        let captures = collections.find(c => c.getName() === 'Captures');
        if (!captures) {
            captures = collections.find(c => c.getName() === 'Inbox');
        }

        if (!captures) {
            // Fallback: add to journal
            const journal = await this.getTodayJournalRecord(data);
            if (journal) {
                await this.appendOneLiner(journal, timeStr, `Link: ${url}`);
            }
            return { verb: 'captured', title: url, guid: journal?.guid, major: false };
        }

        // Create a capture record for the URL
        // For now, just create with URL as title
        // Future: fetch page, extract title, use readability
        const recordGuid = captures.createRecord(url);
        if (!recordGuid) {
            log('Failed to create capture record');
            return null;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await captures.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (record) {
            record.prop('url')?.set(url);
            record.prop('source')?.setChoice('Web');
        }

        // Also add reference in journal
        const journal = await this.getTodayJournalRecord(data);
        if (journal) {
            await this.addRefToJournal(journal, timeStr, 'captured', recordGuid);
        }

        return {
            verb: 'captured',
            title: url,
            guid: recordGuid,
            major: true
        };
    }

    async handlePhoto(message, data, timeStr, log, debug) {
        debug('Photo message');

        // For now, add a note about the photo to journal
        // Future: download photo, store, create capture with embedded image
        const caption = message.caption || 'Photo';
        const journal = await this.getTodayJournalRecord(data);

        if (journal) {
            await this.appendOneLiner(journal, timeStr, `[Photo] ${caption}`);
        }

        return {
            verb: 'captured',
            title: caption,
            guid: journal?.guid,
            major: false
        };
    }

    // =========================================================================
    // Text Routing (from legacy plugin patterns)
    // =========================================================================

    async handleText(text, data, timeStr, log, debug) {
        if (!text.trim()) return null;

        const content = text.trim();
        const lines = content.split('\n').filter(l => l.trim() !== '');

        const isOneLiner = lines.length === 1;
        const isShort = lines.length >= 2 && lines.length <= 5 && !content.startsWith('# ');
        const isMarkdownDoc = content.startsWith('# ');

        const journal = await this.getTodayJournalRecord(data);
        if (!journal) {
            log('Could not find Journal');
            return null;
        }

        if (isOneLiner) {
            // One-liner: simple append with timestamp
            debug('Routing: one-liner → Journal');
            await this.appendOneLiner(journal, timeStr, content);
            return {
                verb: 'noted',
                title: content.slice(0, 50),
                guid: journal.guid,
                major: false
            };

        } else if (isShort) {
            // Short note (2-5 lines): first line as parent, rest as children
            debug('Routing: short note → Journal');
            await this.appendShortNote(journal, timeStr, lines, data);
            return {
                verb: 'noted',
                title: lines[0].slice(0, 50),
                guid: journal.guid,
                major: false
            };

        } else if (isMarkdownDoc) {
            // Markdown document: create in Captures, add ref to Journal
            debug('Routing: markdown doc → Captures');
            const result = await this.createCapture(content, data, log);
            if (result) {
                await this.addRefToJournal(journal, timeStr, 'added', result.guid);
                return {
                    verb: 'added',
                    title: result.title,
                    guid: result.guid,
                    major: true
                };
            } else {
                // Fallback: insert in journal
                await this.insertMarkdownToJournal(content, journal, timeStr, data);
                return {
                    verb: 'noted',
                    title: lines[0].slice(0, 50),
                    guid: journal.guid,
                    major: false
                };
            }

        } else {
            // Default (>5 lines, no heading): insert with hierarchy
            debug('Routing: long text → Journal');
            const firstLine = lines[0];
            const restContent = content.split('\n').slice(1).join('\n');
            const timestampedContent = `**${timeStr}** ${firstLine}\n${restContent}`;
            await this.insertMarkdownToJournal(timestampedContent, journal, timeStr, data);
            return {
                verb: 'noted',
                title: firstLine.slice(0, 50),
                guid: journal.guid,
                major: false
            };
        }
    }

    // =========================================================================
    // Journal Helpers
    // =========================================================================

    async getTodayJournalRecord(data) {
        try {
            const collections = await data.getAllCollections();
            const journalCollection = collections.find(c => c.getName() === 'Journal');
            if (!journalCollection) return null;

            // Journal guids end with the date in YYYYMMDD format
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

            const records = await journalCollection.getAllRecords();
            return records.find(r => r.guid.endsWith(today)) || null;
        } catch (e) {
            return null;
        }
    }

    async appendOneLiner(record, timeStr, text) {
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const newItem = await record.createLineItem(null, lastItem, 'text');
        if (newItem) {
            // Parse inline markdown (links, bold, etc.)
            const segments = this.parseInlineMarkdown(timeStr, text);
            newItem.setSegments(segments);
        }
    }

    parseInlineMarkdown(timeStr, text) {
        // Check for markdown link: [text](url)
        const linkMatch = text.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
            const before = text.slice(0, linkMatch.index);
            const linkText = linkMatch[1];
            const url = linkMatch[2];
            const after = text.slice(linkMatch.index + linkMatch[0].length);

            const segments = [{ type: 'bold', text: timeStr }, { type: 'text', text: ' ' }];
            if (before) segments.push({ type: 'text', text: before });
            segments.push({ type: 'link', text: linkText, url: url });
            if (after) segments.push({ type: 'text', text: after });
            return segments;
        }

        return [
            { type: 'bold', text: timeStr },
            { type: 'text', text: ' ' + text }
        ];
    }

    async appendShortNote(record, timeStr, lines, data) {
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        // Create parent item with first line
        const parentItem = await record.createLineItem(null, lastItem, 'text');
        if (!parentItem) return;

        parentItem.setSegments([
            { type: 'bold', text: timeStr },
            { type: 'text', text: ' ' + lines[0] }
        ]);

        // Add remaining lines as children
        let childLast = null;
        for (let i = 1; i < lines.length; i++) {
            const childItem = await record.createLineItem(parentItem, childLast, 'text');
            if (childItem) {
                childItem.setSegments([{ type: 'text', text: lines[i] }]);
                childLast = childItem;
            }
        }
    }

    async addRefToJournal(journalRecord, timeStr, action, guid) {
        const existingItems = await journalRecord.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === journalRecord.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const newItem = await journalRecord.createLineItem(null, lastItem, 'text');
        if (newItem) {
            newItem.setSegments([
                { type: 'bold', text: timeStr },
                { type: 'text', text: ` ${action} ` },
                { type: 'ref', text: { guid: guid } }
            ]);
        }
    }

    async insertMarkdownToJournal(content, journal, timeStr, data) {
        // Use Sync Hub's markdown utilities if available
        if (window.syncHub?.insertMarkdown) {
            await window.syncHub.insertMarkdown(content, journal, null);
        } else {
            // Fallback: simple text insert
            await this.appendOneLiner(journal, timeStr, content.split('\n')[0]);
        }
    }

    // =========================================================================
    // Captures Collection
    // =========================================================================

    async createCapture(content, data, log) {
        try {
            const collections = await data.getAllCollections();
            let captures = collections.find(c => c.getName() === 'Captures');
            if (!captures) {
                captures = collections.find(c => c.getName() === 'Inbox');
            }
            if (!captures) {
                log('Captures collection not found');
                return null;
            }

            // Extract title from first heading
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

            // Create the record
            const recordGuid = captures.createRecord(title);
            if (!recordGuid) {
                log('Failed to create capture record');
                return null;
            }

            await new Promise(resolve => setTimeout(resolve, 50));
            const records = await captures.getAllRecords();
            const record = records.find(r => r.guid === recordGuid);

            if (record) {
                // Set source
                record.prop('source')?.setChoice('Telegram');

                // Insert body content (remove title heading)
                const bodyContent = content.replace(/^#\s+.+\n?/, '').trim();
                if (bodyContent && window.syncHub?.insertMarkdown) {
                    await window.syncHub.insertMarkdown(bodyContent, record, null);
                }
            }

            return { guid: recordGuid, title };
        } catch (e) {
            log(`Error creating capture: ${e.message}`);
            return null;
        }
    }
}
