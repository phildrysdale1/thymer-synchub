const VERSION = 'v1.3.1';
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
 *
 * Edited by PhilDrysdale so:
 * Tmestamps are DateTime rather than just bold text 
 * Multi-line entries are not just indented but also are bulleted lists.
 * Timezone is set to UTC.
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
            window.syncHub.unregister('telegram-sync');
        }
    }

    async registerWithSyncHub() {
        await window.syncHub.register({
            id: 'telegram-sync',
            name: 'Telegram',
            icon: 'ti-plane',
            defaultInterval: '1m',
            version: VERSION,
            sync: async (ctx) => this.sync(ctx),
        });
    }

    // =========================================================================
    // Time Formatting (for Thymer datetime segments)
    // =========================================================================

    /**
     * Format time as HHMMSS for Thymer datetime segments
     */
    formatTimeHHMMSS(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}${minutes}${seconds}`;
    }

    /**
     * Create a Thymer datetime segment for a time-only value
     * @param {Date} date - The date/time to format
     * @returns {Object} - Thymer datetime segment
     */
    createTimeSegment(date) {
        // Calculate timezone offset in quarter-hours from UTC
        // JavaScript's getTimezoneOffset() returns minutes west of UTC (opposite sign)
        // Thymer expects quarter-hours east of UTC
        const offsetMinutes = -date.getTimezoneOffset(); // Flip sign: positive = east
        const offsetQuarterHours = offsetMinutes / 15; // Convert to quarter-hours
        
        return {
            type: 'datetime',
            text: {
                d: "",  // Empty string = time only (no date)
                t: {
                    t: this.formatTimeHHMMSS(date),
                    tz: offsetQuarterHours  // Browser's timezone in quarter-hours
                }
            }
        };
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
            debug('Telegram Sync record not found in Sync Hub');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        // Get bot token
        const botToken = myRecord.text('token');
        if (!botToken) {
            debug('No bot token configured');
            return { summary: 'Not configured', created: 0, updated: 0 };
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

        debug(`Routing: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // Photo handling (future: store photo)
        if (message.photo) {
            return this.handlePhoto(message, data, timestamp, log, debug);
        }

        // URL detection and special handling
        if (text.trim() && this.isUrl(text.trim())) {
            const url = text.trim();

            // GitHub issue/PR URL
            if (this.isGitHubIssueUrl(url)) {
                return this.handleGitHubUrl(url, data, timestamp, log, debug);
            }

            // iCal URL
            if (this.isICalUrl(url)) {
                return this.handleICalUrl(url, data, timestamp, log, debug);
            }

            // Regular web URL - fetch and capture
            return this.handleWebUrl(url, data, timestamp, log, debug);
        }

        // Text-based routing (from legacy plugin patterns)
        return this.handleText(text, data, timestamp, log, debug);
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

    async handleGitHubUrl(url, data, timestamp, log, debug) {
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

        await this.appendOneLiner(journal, timestamp, `${type === 'pull' ? 'PR' : 'Issue'}: [${title}](${url})`);

        return {
            verb: 'captured',
            title: `"${title}" to`,
            guid: journal.guid,
            major: false
        };
    }

    async handleICalUrl(url, data, timestamp, log, debug) {
        debug(`iCal URL: ${url}`);

        // For now, just capture as a link
        // Future: parse iCal and add events to Calendar
        const journal = await this.getTodayJournalRecord(data);
        if (!journal) return null;

        await this.appendOneLiner(journal, timestamp, `Calendar: ${url}`);

        return {
            verb: 'captured',
            title: `"Calendar link" to`,
            guid: journal.guid,
            major: false
        };
    }

    async handleWebUrl(url, data, timestamp, log, debug) {
        debug(`Web URL: ${url}`);

        // Fetch and parse the page
        let pageInfo = { title: url, description: '', author: '', content: '' };
        try {
            pageInfo = await this.fetchPageInfo(url, debug);
        } catch (e) {
            debug(`Failed to fetch page: ${e.message}`);
        }

        // Find Captures collection (fallback to Inbox)
        const collections = await data.getAllCollections();
        let captures = collections.find(c => c.getName() === 'Captures');
        if (!captures) {
            captures = collections.find(c => c.getName() === 'Inbox');
        }

        if (!captures) {
            // Fallback: add to journal
            const journal = await this.getTodayJournalRecord(data);
            if (!journal) return null;
            await this.appendOneLiner(journal, timestamp, `Link: [${pageInfo.title}](${url})`);
            return {
                verb: 'captured',
                title: `"${pageInfo.title}" to`,
                guid: journal.guid,
                major: false
            };
        }

        // Create record in Captures
        const recordGuid = captures.createNewRecord(pageInfo.title);
        if (!recordGuid) {
            log('Failed to create record');
            return null;
        }
        const record = data.getRecord(recordGuid);
        if (!record) return null;

        // Set URL if field exists
        if (record.prop('url')) {
            record.prop('url')?.set(url);
        }

        // Set author if field exists and we have it
        if (record.prop('author') && pageInfo.author) {
            record.prop('author')?.set(pageInfo.author);
        }

        // Set captured_at to now using DateTime
        if (record.prop('captured_at') && typeof DateTime !== 'undefined') {
            const dt = new DateTime(new Date());
            record.prop('captured_at')?.set(dt.value());
        }

        // Add description/content to the record body
        if (pageInfo.description || pageInfo.content) {
            const bodyContent = pageInfo.description || pageInfo.content;
            if (window.syncHub?.insertMarkdown) {
                await window.syncHub.insertMarkdown(bodyContent, record, null);
            }
        }

        // Also add reference in journal
        const journal = await this.getTodayJournalRecord(data);
        if (journal) {
            await this.addRefToJournal(journal, timestamp, 'captured', recordGuid);
        }

        return {
            verb: 'captured',
            title: null,  // ref IS the captured record
            guid: recordGuid,
            major: true
        };
    }

    /**
     * Fetch a web page and extract title, description, author, and content
     */
    async fetchPageInfo(url, debug) {
        let html;

        // Try direct fetch first
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; ThymerBot/1.0)',
                }
            });
            if (response.ok) {
                html = await response.text();
                debug(`Direct fetch: ${html.length} bytes`);
            }
        } catch (e) {
            debug(`Direct fetch failed (CORS?): ${e.message}`);
        }

        // If direct fetch failed, try CORS proxy
        if (!html) {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            debug(`Trying CORS proxy...`);
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`Proxy failed: HTTP ${response.status}`);
            }
            html = await response.text();
            debug(`Proxy fetch: ${html.length} bytes`);
        }

        // Extract metadata
        const title = this.extractTitle(html) || url;
        const description = this.extractDescription(html);
        const author = this.extractAuthor(html);
        const content = this.extractContent(html);

        debug(`Title: ${title}`);
        if (description) debug(`Description: ${description.slice(0, 100)}...`);

        return { title, description, author, content };
    }

    extractTitle(html) {
        // Try og:title first
        const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (ogMatch) return this.decodeHtmlEntities(ogMatch[1]);

        // Try twitter:title
        const twitterMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
        if (twitterMatch) return this.decodeHtmlEntities(twitterMatch[1]);

        // Fall back to <title>
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) return this.decodeHtmlEntities(titleMatch[1].trim());

        return null;
    }

    extractDescription(html) {
        // Try og:description first
        const ogMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        if (ogMatch) return this.decodeHtmlEntities(ogMatch[1]);

        // Try twitter:description
        const twitterMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i);
        if (twitterMatch) return this.decodeHtmlEntities(twitterMatch[1]);

        // Try meta description
        const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        if (metaMatch) return this.decodeHtmlEntities(metaMatch[1]);

        return '';
    }

    extractAuthor(html) {
        // Try article:author
        const articleMatch = html.match(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i);
        if (articleMatch) return this.decodeHtmlEntities(articleMatch[1]);

        // Try author meta
        const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
        if (authorMatch) return this.decodeHtmlEntities(authorMatch[1]);

        return '';
    }

    extractContent(html) {
        // Simple extraction: try to get article or main content
        // This is a basic implementation - full readability would be better

        // Remove scripts and styles
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

        // Try to find article or main content
        const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) {
            text = articleMatch[1];
        } else {
            const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            if (mainMatch) {
                text = mainMatch[1];
            }
        }

        // Strip remaining HTML tags
        text = text.replace(/<[^>]+>/g, ' ');

        // Normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Limit length
        if (text.length > 2000) {
            text = text.slice(0, 2000) + '...';
        }

        return text;
    }

    decodeHtmlEntities(str) {
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }

    async handlePhoto(message, data, timestamp, log, debug) {
        debug('Photo message');

        // For now, add a note about the photo to journal
        // Future: download photo, store, create capture with embedded image
        const caption = message.caption || 'Photo';
        const journal = await this.getTodayJournalRecord(data);

        if (journal) {
            await this.appendOneLiner(journal, timestamp, `[Photo] ${caption}`);
        }

        return {
            verb: 'captured',
            title: `"[Photo] ${caption.slice(0, 30)}" to`,
            guid: journal?.guid,
            major: false
        };
    }

    // =========================================================================
    // Text Routing
    // =========================================================================

    async handleText(text, data, timestamp, log, debug) {
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
            await this.appendOneLiner(journal, timestamp, content);
            return {
                verb: 'noted',
                title: `"${content.slice(0, 40)}" to`,
                guid: journal.guid,
                major: false
            };

        } else if (isShort) {
            // Short note (2-5 lines): first line as parent, rest as children
            debug('Routing: short note → Journal');
            await this.appendShortNote(journal, timestamp, lines, data);
            return {
                verb: 'noted',
                title: `"${lines[0].slice(0, 40)}" to`,
                guid: journal.guid,
                major: false
            };

        } else if (isMarkdownDoc) {
            // Markdown document: create in Captures, add ref to Journal
            debug('Routing: markdown doc → Captures');
            const result = await this.createCapture(content, data, log);
            if (result) {
                await this.addRefToJournal(journal, timestamp, 'added', result.guid);
                return {
                    verb: 'added',
                    title: result.title,
                    guid: result.guid,
                    major: true
                };
            } else {
                // Fallback: insert in journal
                await this.insertMarkdownToJournal(content, journal, timestamp, data);
                return {
                    verb: 'noted',
                    title: `"${lines[0].slice(0, 40)}" to`,
                    guid: journal.guid,
                    major: false
                };
            }

        } else {
            // Default (>5 lines, no heading): insert with hierarchy
            debug('Routing: long text → Journal');
            const firstLine = lines[0];
            const restContent = content.split('\n').slice(1).join('\n');
            const timeSegment = this.createTimeSegment(timestamp);
            const timestampedContent = `${firstLine}\n${restContent}`;
            await this.insertMarkdownToJournal(timestampedContent, journal, timestamp, data, true);
            return {
                verb: 'noted',
                title: `"${firstLine.slice(0, 40)}" to`,
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

            const records = await journalCollection.getAllRecords();

            // Journal guids end with the date in YYYYMMDD format
            // Thymer uses previous day's journal until ~3am, so try today first, then yesterday
            const now = new Date();
            const today = now.toISOString().slice(0, 10).replace(/-/g, '');

            let journal = records.find(r => r.guid.endsWith(today));
            if (journal) return journal;

            // Fallback: try yesterday (for late-night work sessions)
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

            return records.find(r => r.guid.endsWith(yesterdayStr)) || null;
        } catch (e) {
            return null;
        }
    }

    async appendOneLiner(record, timestamp, text) {
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const newItem = await record.createLineItem(null, lastItem, 'text');
        if (newItem) {
            // Parse inline markdown (links, bold, etc.) and prepend time segment
            const segments = this.parseInlineMarkdown(timestamp, text);
            newItem.setSegments(segments);
        }
    }

    parseInlineMarkdown(timestamp, text) {
        // Create the time segment first
        const timeSegment = this.createTimeSegment(timestamp);
        
        // Check for markdown link: [text](url)
        const linkMatch = text.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
            const before = text.slice(0, linkMatch.index);
            const linkText = linkMatch[1];
            const url = linkMatch[2];
            const after = text.slice(linkMatch.index + linkMatch[0].length);

            const segments = [timeSegment, { type: 'text', text: ' ' }];
            if (before) segments.push({ type: 'text', text: before });
            segments.push({ type: 'link', text: linkText, url: url });
            if (after) segments.push({ type: 'text', text: after });
            return segments;
        }

        return [
            timeSegment,
            { type: 'text', text: ' ' + text }
        ];
    }

    async appendShortNote(record, timestamp, lines, data) {
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        // Create parent item with first line and time segment
        const parentItem = await record.createLineItem(null, lastItem, 'text');
        if (!parentItem) return;

        const timeSegment = this.createTimeSegment(timestamp);
        parentItem.setSegments([
            timeSegment,
            { type: 'text', text: ' ' + lines[0] }
        ]);

        // Add remaining lines as bulleted children (ulist = unordered list)
        let childLast = null;
        for (let i = 1; i < lines.length; i++) {
            const childItem = await record.createLineItem(parentItem, childLast, 'ulist');
            if (childItem) {
                childItem.setSegments([{ type: 'text', text: lines[i] }]);
                childLast = childItem;
            }
        }
    }

    async addRefToJournal(journalRecord, timestamp, action, guid) {
        const existingItems = await journalRecord.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === journalRecord.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const newItem = await journalRecord.createLineItem(null, lastItem, 'text');
        if (newItem) {
            const timeSegment = this.createTimeSegment(timestamp);
            newItem.setSegments([
                timeSegment,
                { type: 'text', text: ` ${action} ` },
                { type: 'ref', text: { guid: guid } }
            ]);
        }
    }

    async insertMarkdownToJournal(content, journal, timestamp, data, prependTime = false) {
        // Use Sync Hub's markdown utilities if available
        if (window.syncHub?.insertMarkdown) {
            // If we need to prepend the time segment, we'll need to do it manually
            if (prependTime) {
                const timeSegment = this.createTimeSegment(timestamp);
                // Insert first line with time, then rest as markdown
                const lines = content.split('\n');
                const firstLine = lines[0];
                const restContent = lines.slice(1).join('\n');
                
                // Create parent with time + first line
                const existingItems = await journal.getLineItems();
                const topLevelItems = existingItems.filter(item => item.parent_guid === journal.guid);
                const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;
                
                const parentItem = await journal.createLineItem(null, lastItem, 'text');
                if (parentItem) {
                    parentItem.setSegments([
                        timeSegment,
                        { type: 'text', text: ' ' + firstLine }
                    ]);
                    
                    // Insert remaining content as bulleted children using markdown
                    // Note: insertMarkdown creates child items which render as bullets
                    if (restContent) {
                        await window.syncHub.insertMarkdown(restContent, journal, parentItem);
                    }
                }
            } else {
                await window.syncHub.insertMarkdown(content, journal, null);
            }
        } else {
            // Fallback: simple text insert
            await this.appendOneLiner(journal, timestamp, content.split('\n')[0]);
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
            const title = titleMatch ? titleMatch[1] : 'Untitled Note';

            // Create the record
            const guid = captures.createNewRecord(title);
            if (!guid) {
                log('Failed to create record');
                return null;
            }

            const record = data.getRecord(guid);
            if (!record) return null;

            // Set captured_at to now using DateTime
            if (record.prop('captured_at') && typeof DateTime !== 'undefined') {
                const dt = new DateTime(new Date());
                record.prop('captured_at')?.set(dt.value());
            }

            // Insert the markdown content
            if (window.syncHub?.insertMarkdown) {
                await window.syncHub.insertMarkdown(content, record, null);
            }

            return { title, guid };
        } catch (e) {
            log(`Error creating capture: ${e.message}`);
            return null;
        }
    }
}
