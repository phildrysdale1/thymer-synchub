const VERSION = 'v1.3.0';
/**
 * Telegram Sync - App Plugin
 *
 * Polls Telegram Bot API for messages and routes them to appropriate collections.
 * Smart routing with task creation, date parsing, and hashtag support.
 *
 * Setup:
 * 1. Message @BotFather on Telegram: /newbot
 * 2. Copy the bot token
 * 3. In Thymer Sync Hub, find Telegram record
 * 4. Paste token into Token field
 */

class Plugin extends AppPlugin {

    async onLoad() {
        this.syncHubReadyHandler = () => this.registerWithSyncHub();
        window.addEventListener('synchub-ready', this.syncHubReadyHandler);

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
    // Sync Logic
    // =========================================================================

    async sync({ data, ui, log, debug }) {
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

        const botToken = myRecord.text('token');
        if (!botToken) {
            debug('No bot token configured');
            return { summary: 'Not configured', created: 0, updated: 0 };
        }

        let config = {};
        const configText = myRecord.text('config');
        if (configText) {
            try {
                config = JSON.parse(configText);
            } catch (e) {
                // Ignore invalid JSON
            }
        }

        const lastOffset = config.last_offset || 0;
        debug(`Polling Telegram (offset: ${lastOffset})...`);

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

        if (message.photo) {
            return this.handlePhoto(message, data, timestamp, log, debug);
        }

        if (text.trim() && this.isUrl(text.trim())) {
            const url = text.trim();

            if (this.isGitHubIssueUrl(url)) {
                return this.handleGitHubUrl(url, data, timestamp, log, debug);
            }

            if (this.isICalUrl(url)) {
                return this.handleICalUrl(url, data, timestamp, log, debug);
            }

            return this.handleWebUrl(url, data, timestamp, log, debug);
        }

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
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/);
        if (!match) return null;

        const [, owner, repo, type, number] = match;
        const title = `${owner}/${repo}#${number}`;

        debug(`GitHub ${type}: ${title}`);

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

        let pageInfo = { title: url, description: '', author: '', content: '' };
        try {
            pageInfo = await this.fetchPageInfo(url, debug);
        } catch (e) {
            debug(`Failed to fetch page: ${e.message}`);
        }

        const collections = await data.getAllCollections();
        let captures = collections.find(c => c.getName() === 'Captures');
        if (!captures) {
            captures = collections.find(c => c.getName() === 'Inbox');
        }

        if (!captures) {
            const journal = await this.getTodayJournalRecord(data);
            if (journal) {
                await this.appendOneLiner(journal, timestamp, `[${pageInfo.title}](${url})`);
            }
            return { verb: 'captured', title: `"${pageInfo.title.slice(0, 40)}" to`, guid: journal?.guid, major: false };
        }

        const externalId = `telegram_url_${url}`;
        const existingRecords = await captures.getAllRecords();
        const existing = existingRecords.find(r => r.text('external_id') === externalId);
        if (existing) {
            debug(`Already captured: ${url}`);
            return { verb: 'skipped', title: null, guid: existing.guid, major: false };
        }

        const recordGuid = captures.createRecord(pageInfo.title);
        if (!recordGuid) {
            log('Failed to create capture record');
            return null;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await captures.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (record) {
            record.prop('external_id')?.set(externalId);
            record.prop('source_url')?.set(url);
            record.prop('source')?.setChoice('Web');
            if (pageInfo.author) {
                record.prop('source_author')?.set(pageInfo.author);
            }

            if (typeof DateTime !== 'undefined') {
                const dt = new DateTime(new Date());
                record.prop('captured_at')?.set(dt.value());
            }

            if (pageInfo.description || pageInfo.content) {
                const bodyContent = pageInfo.description || pageInfo.content;
                if (window.syncHub?.insertMarkdown) {
                    await window.syncHub.insertMarkdown(bodyContent, record, null);
                }
            }
        }

        const journal = await this.getTodayJournalRecord(data);
        if (journal) {
            await this.addRefToJournal(journal, timestamp, 'captured', recordGuid);
        }

        return {
            verb: 'captured',
            title: null,
            guid: recordGuid,
            major: true
        };
    }

    async fetchPageInfo(url, debug) {
        let html;

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

        const title = this.extractTitle(html) || url;
        const description = this.extractDescription(html);
        const author = this.extractAuthor(html);
        const content = this.extractContent(html);

        debug(`Title: ${title}`);
        if (description) debug(`Description: ${description.slice(0, 100)}...`);

        return { title, description, author, content };
    }

    extractTitle(html) {
        const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (ogMatch) return this.decodeHtmlEntities(ogMatch[1]);

        const twitterMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
        if (twitterMatch) return this.decodeHtmlEntities(twitterMatch[1]);

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) return this.decodeHtmlEntities(titleMatch[1].trim());

        return null;
    }

    extractDescription(html) {
        const ogMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        if (ogMatch) return this.decodeHtmlEntities(ogMatch[1]);

        const twitterMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i);
        if (twitterMatch) return this.decodeHtmlEntities(twitterMatch[1]);

        const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        if (metaMatch) return this.decodeHtmlEntities(metaMatch[1]);

        return '';
    }

    extractAuthor(html) {
        const articleMatch = html.match(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i);
        if (articleMatch) return this.decodeHtmlEntities(articleMatch[1]);

        const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
        if (authorMatch) return this.decodeHtmlEntities(authorMatch[1]);

        return '';
    }

    extractContent(html) {
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

        const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) {
            text = articleMatch[1];
        } else {
            const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            if (mainMatch) {
                text = mainMatch[1];
            }
        }

        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();

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

        const journal = await this.getTodayJournalRecord(data);
        if (!journal) {
            log('Could not find Journal');
            return null;
        }

        const isOneLiner = lines.length === 1;
        const isMarkdownDoc = content.startsWith('# ');
        const firstLineIsTask = this.isTaskLine(lines[0]);
        const hasAnyTasks = lines.some(line => this.isTaskLine(line));

        if (isOneLiner && firstLineIsTask) {
            debug('Routing: single task → Journal');
            const { text: taskText, isImportant, date } = this.parseTaskLine(lines[0]);
            
            const existingItems = await journal.getLineItems();
            const topLevelItems = existingItems.filter(item => item.parent_guid === journal.guid);
            const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;
            
            const taskItem = await journal.createLineItem(null, lastItem, 'task');
            if (taskItem) {
                const textSegments = this.parseTextSegments(taskText);
                const segments = [...textSegments];
                
                if (date) {
                    segments.push({ type: 'text', text: ' ' });
                    segments.push(this.createDateSegment(date));
                }
                
                taskItem.setSegments(segments);
                
                if (isImportant) {
                    await taskItem.setMetaProperty('done', 4);
                }
            }
            
            return {
                verb: 'added task',
                title: `"${taskText.slice(0, 40)}" to`,
                guid: journal.guid,
                major: false
            };

        } else if (isOneLiner) {
            debug('Routing: one-liner → Journal');
            await this.appendOneLiner(journal, timestamp, content);
            return {
                verb: 'noted',
                title: `"${content.slice(0, 40)}" to`,
                guid: journal.guid,
                major: false
            };

        } else if (isMarkdownDoc) {
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
                await this.insertMarkdownToJournal(content, journal, timestamp, data);
                return {
                    verb: 'noted',
                    title: `"${lines[0].slice(0, 40)}" to`,
                    guid: journal.guid,
                    major: false
                };
            }

        } else if (hasAnyTasks) {
            debug('Routing: multi-line with tasks → Journal');
            await this.appendMultipleLines(journal, timestamp, lines);
            
            const taskCount = lines.filter(l => this.isTaskLine(l)).length;
            const verb = taskCount === 1 ? 'added task' : `added ${taskCount} tasks`;
            
            return {
                verb: verb,
                title: `to`,
                guid: journal.guid,
                major: false
            };

        } else {
            debug('Routing: multi-line note → Journal');
            await this.appendShortNote(journal, timestamp, lines, data);
            return {
                verb: 'noted',
                title: `"${lines[0].slice(0, 40)}" to`,
                guid: journal.guid,
                major: false
            };
        }
    }

    // =========================================================================
    // Task Parsing
    // =========================================================================

    isTaskLine(line) {
        const trimmed = line.trim();
        return trimmed.startsWith('[]') || trimmed.toLowerCase().startsWith('task');
    }

    parseTaskLine(line) {
        let text = line.trim();
        
        if (text.startsWith('[]')) {
            text = text.slice(2).trim();
        } else if (text.toLowerCase().startsWith('task')) {
            text = text.slice(4).trim();
        }

        const isImportant = text.toLowerCase().includes('@important');
        if (isImportant) {
            text = text.replace(/@important/gi, '').trim();
        }

        const { text: cleanedText, date } = this.extractAndRemoveDate(text);

        return { text: cleanedText, isImportant, date };
    }

    // =========================================================================
    // Date Parsing
    // =========================================================================

    parseDate(text) {
        const now = new Date();
        const lowerText = text.toLowerCase();

        if (lowerText.includes('@tomorrow') || lowerText.includes('tomorrow')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
        }
        
        if (lowerText.includes('@today') || lowerText.includes('today')) {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        const monthNames = {
            jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
            apr: 3, april: 3, may: 4, jun: 5, june: 5,
            jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
            oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
        };

        const monthDayMatch = text.match(/@?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
        if (monthDayMatch) {
            const month = monthNames[monthDayMatch[1].toLowerCase()];
            const day = parseInt(monthDayMatch[2]);
            let year = now.getFullYear();
            const testDate = new Date(year, month, day);
            if (testDate < now) {
                year++;
            }
            return new Date(year, month, day);
        }

        const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (isoMatch) {
            const year = parseInt(isoMatch[1]);
            const month = parseInt(isoMatch[2]) - 1;
            const day = parseInt(isoMatch[3]);
            return new Date(year, month, day);
        }

        const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
        if (slashMatch) {
            const first = parseInt(slashMatch[1]);
            const second = parseInt(slashMatch[2]);
            let month, day;
            if (first > 12) {
                day = first;
                month = second - 1;
            } else {
                month = first - 1;
                day = second;
            }
            const year = now.getFullYear();
            return new Date(year, month, day);
        }

        return null;
    }

    extractAndRemoveDate(text) {
        const date = this.parseDate(text);
        if (!date) {
            return { text, date: null };
        }

        let cleanedText = text;

        cleanedText = cleanedText.replace(/@?tomorrow\b/gi, '');
        cleanedText = cleanedText.replace(/@?today\b/gi, '');
        cleanedText = cleanedText.replace(/@?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi, '');
        cleanedText = cleanedText.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
        cleanedText = cleanedText.replace(/\b\d{1,2}\/\d{1,2}\b/g, '');
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

        return { text: cleanedText, date };
    }

    // =========================================================================
    // Datetime Helpers
    // =========================================================================

    formatTimeHHMMSS(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}${minutes}${seconds}`;
    }

    createTimeSegment(date) {
        const offsetMinutes = -date.getTimezoneOffset();
        const offsetQuarterHours = offsetMinutes / 15;
        
        return {
            type: 'datetime',
            text: {
                d: "",
                t: {
                    t: this.formatTimeHHMMSS(date),
                    tz: offsetQuarterHours
                }
            }
        };
    }

    formatDateYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    createDateSegment(date) {
        return {
            type: 'datetime',
            text: {
                d: this.formatDateYYYYMMDD(date)
            }
        };
    }

    // =========================================================================
    // Text Segment Parsing
    // =========================================================================

    parseTextSegments(text) {
        const segments = [];
        let remaining = text;
        
        while (remaining.length > 0) {
            const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
            const hashtagMatch = remaining.match(/(^|[^#])#([a-zA-Z0-9_-]+)/);
            
            let firstMatch = null;
            let firstIndex = Infinity;
            let matchType = null;
            
            if (linkMatch && linkMatch.index < firstIndex) {
                firstMatch = linkMatch;
                firstIndex = linkMatch.index;
                matchType = 'link';
            }
            
            if (hashtagMatch && hashtagMatch.index < firstIndex) {
                firstMatch = hashtagMatch;
                firstIndex = hashtagMatch.index;
                matchType = 'hashtag';
            }
            
            if (!firstMatch) {
                if (remaining) {
                    segments.push({ type: 'text', text: remaining });
                }
                break;
            }
            
            if (matchType === 'link') {
                if (linkMatch.index > 0) {
                    segments.push({ type: 'text', text: remaining.slice(0, linkMatch.index) });
                }
                
                segments.push({ 
                    type: 'link', 
                    text: linkMatch[1], 
                    url: linkMatch[2] 
                });
                
                remaining = remaining.slice(linkMatch.index + linkMatch[0].length);
                
            } else if (matchType === 'hashtag') {
                const beforeText = remaining.slice(0, hashtagMatch.index + hashtagMatch[1].length);
                if (beforeText) {
                    segments.push({ type: 'text', text: beforeText });
                }
                
                segments.push({ 
                    type: 'hashtag', 
                    text: '#' + hashtagMatch[2]
                });
                
                remaining = remaining.slice(hashtagMatch.index + hashtagMatch[0].length);
            }
        }
        
        return segments.length > 0 ? segments : [{ type: 'text', text: text }];
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

            const now = new Date();
            const today = now.toISOString().slice(0, 10).replace(/-/g, '');

            let journal = records.find(r => r.guid.endsWith(today));
            if (journal) return journal;

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

        const { text: cleanedText, date } = this.extractAndRemoveDate(text);

        const newItem = await record.createLineItem(null, lastItem, 'text');
        if (newItem) {
            const timeSegment = this.createTimeSegment(timestamp);
            const textSegments = this.parseTextSegments(cleanedText);
            
            const segments = [timeSegment, { type: 'text', text: ' ' }, ...textSegments];
            
            if (date) {
                segments.push({ type: 'text', text: ' ' });
                segments.push(this.createDateSegment(date));
            }
            
            newItem.setSegments(segments);
        }
    }

    async appendShortNote(record, timestamp, lines, data) {
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
        const lastItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;

        const parentItem = await record.createLineItem(null, lastItem, 'text');
        if (!parentItem) return;

        const timeSegment = this.createTimeSegment(timestamp);
        parentItem.setSegments([
            timeSegment,
            { type: 'text', text: ' ' + lines[0] }
        ]);

        let childLast = null;
        for (let i = 1; i < lines.length; i++) {
            const childItem = await record.createLineItem(parentItem, childLast, 'ulist');
            if (childItem) {
                childItem.setSegments([{ type: 'text', text: lines[i] }]);
                childLast = childItem;
            }
        }
    }

    async appendMultipleLines(record, timestamp, lines) {
        const existingItems = await record.getLineItems();
        const topLevelItems = existingItems.filter(item => item.parent_guid === record.guid);
        let lastTopLevelItem = topLevelItems.length > 0 ? topLevelItems[topLevelItems.length - 1] : null;
        
        let currentTaskParent = null;
        let lastChildOfTask = null;
        
        for (const line of lines) {
            const isTask = this.isTaskLine(line);
            
            if (isTask) {
                const { text: taskText, isImportant, date } = this.parseTaskLine(line);
                
                const taskItem = await record.createLineItem(null, lastTopLevelItem, 'task');
                if (taskItem) {
                    const textSegments = this.parseTextSegments(taskText);
                    const segments = [...textSegments];
                    
                    if (date) {
                        segments.push({ type: 'text', text: ' ' });
                        segments.push(this.createDateSegment(date));
                    }
                    
                    taskItem.setSegments(segments);
                    
                    if (isImportant) {
                        await taskItem.setMetaProperty('done', 4);
                    }
                    
                    lastTopLevelItem = taskItem;
                    currentTaskParent = taskItem;
                    lastChildOfTask = null;
                }
            } else {
                const { text: cleanedText, date } = this.extractAndRemoveDate(line);
                
                if (currentTaskParent) {
                    const childItem = await record.createLineItem(currentTaskParent, lastChildOfTask, 'ulist');
                    if (childItem) {
                        const textSegments = this.parseTextSegments(cleanedText);
                        const segments = [...textSegments];
                        
                        if (date) {
                            segments.push({ type: 'text', text: ' ' });
                            segments.push(this.createDateSegment(date));
                        }
                        
                        childItem.setSegments(segments);
                        lastChildOfTask = childItem;
                    }
                } else {
                    const textItem = await record.createLineItem(null, lastTopLevelItem, 'text');
                    if (textItem) {
                        const timeSegment = this.createTimeSegment(timestamp);
                        const textSegments = this.parseTextSegments(cleanedText);
                        const segments = [timeSegment, { type: 'text', text: ' ' }, ...textSegments];
                        
                        if (date) {
                            segments.push({ type: 'text', text: ' ' });
                            segments.push(this.createDateSegment(date));
                        }
                        
                        textItem.setSegments(segments);
                        lastTopLevelItem = textItem;
                    }
                }
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

    async insertMarkdownToJournal(content, journal, timestamp, data) {
        if (window.syncHub?.insertMarkdown) {
            await window.syncHub.insertMarkdown(content, journal, null);
        } else {
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

            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

            const externalId = `telegram_md_${this.simpleHash(content)}`;
            const existingRecords = await captures.getAllRecords();
            const existing = existingRecords.find(r => r.text('external_id') === externalId);
            if (existing) {
                const bodyContent = content.replace(/^#\s+.+\n?/, '').trim();
                if (bodyContent && window.syncHub?.replaceContents) {
                    await window.syncHub.replaceContents(bodyContent, existing);
                }
                return { guid: existing.guid, title, updated: true };
            }

            const recordGuid = captures.createRecord(title);
            if (!recordGuid) {
                log('Failed to create capture record');
                return null;
            }

            await new Promise(resolve => setTimeout(resolve, 50));
            const records = await captures.getAllRecords();
            const record = records.find(r => r.guid === recordGuid);

            if (record) {
                record.prop('external_id')?.set(externalId);
                record.prop('source')?.setChoice('Telegram');

                if (typeof DateTime !== 'undefined') {
                    const dt = new DateTime(new Date());
                    record.prop('captured_at')?.set(dt.value());
                }

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

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
}
