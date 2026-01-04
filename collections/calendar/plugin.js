/**
 * Calendar Collection - Collection Plugin
 *
 * Provides query tools for the Calendar collection.
 * Works with any source: Google, Outlook, Proton, iCal, etc.
 */

class Plugin extends CollectionPlugin {

    // Map labels to IDs for choice fields (choice() returns ID not label)
    CALENDAR_LABEL_TO_ID = {
        'Primary': 'primary',
        'Work': 'work',
        'Personal': 'personal',
        'Family': 'family'
    };

    STATUS_LABEL_TO_ID = {
        'Confirmed': 'confirmed',
        'Tentative': 'tentative',
        'Cancelled': 'cancelled'
    };

    ENERGY_LABEL_TO_ID = {
        'High': 'high',
        'Medium': 'medium',
        'Low': 'low'
    };

    OUTCOME_LABEL_TO_ID = {
        'Productive': 'productive',
        'Neutral': 'neutral',
        'Waste': 'waste'
    };

    // Convert label to ID for filtering
    labelToId(label, type = 'calendar') {
        const maps = {
            calendar: this.CALENDAR_LABEL_TO_ID,
            status: this.STATUS_LABEL_TO_ID,
            energy: this.ENERGY_LABEL_TO_ID,
            outcome: this.OUTCOME_LABEL_TO_ID
        };
        const map = maps[type] || {};
        return map[label] || label.toLowerCase();
    }

    // Convert ID back to label for display
    idToLabel(id, type = 'calendar') {
        if (!id) return null;
        const maps = {
            calendar: this.CALENDAR_LABEL_TO_ID,
            status: this.STATUS_LABEL_TO_ID,
            energy: this.ENERGY_LABEL_TO_ID,
            outcome: this.OUTCOME_LABEL_TO_ID
        };
        const map = maps[type] || {};
        for (const [label, mappedId] of Object.entries(map)) {
            if (mappedId === id || id.toLowerCase() === mappedId) return label;
        }
        return id.charAt(0).toUpperCase() + id.slice(1);
    }

    // Check if record's choice matches target (handles both labels and IDs)
    choiceMatches(record, fieldName, targetLabel) {
        const choiceId = record.prop(fieldName)?.choice();
        if (!choiceId) return false;
        const targetId = this.labelToId(targetLabel, fieldName);
        return choiceId === targetId || choiceId.toLowerCase() === targetId.toLowerCase();
    }

    /**
     * Format a Thymer DateTime value into a rich, timezone-aware structure.
     * Input: dt.value() = {d: 'YYYYMMDD', t?: {t: 'HHMM', tz: number}, r?: {...}}
     */
    formatDateTime(record) {
        const dt = record.prop('time_period')?.datetime();
        if (!dt) return null;

        const val = dt.value();
        if (!val?.d) return null;

        // Parse date YYYYMMDD
        const year = val.d.slice(0, 4);
        const month = val.d.slice(4, 6);
        const day = val.d.slice(6, 8);
        const date = `${year}-${month}-${day}`;

        const result = {
            date,
            all_day: !val.t,
        };

        // Add time if present
        if (val.t?.t) {
            result.time = val.t.t.slice(0, 2) + ':' + val.t.t.slice(2, 4);
        }

        // Add range end if present
        if (val.r?.d) {
            const ry = val.r.d.slice(0, 4);
            const rm = val.r.d.slice(4, 6);
            const rd = val.r.d.slice(6, 8);
            result.end_date = `${ry}-${rm}-${rd}`;
            if (val.r.t?.t) {
                result.end_time = val.r.t.t.slice(0, 2) + ':' + val.r.t.t.slice(2, 4);
            }
        }

        // Add local date from JS Date for convenience
        const jsDate = dt.toDate();
        if (jsDate) {
            result.local = jsDate.toLocaleString();
        }

        return result;
    }

    /**
     * Get today's date in local timezone as YYYY-MM-DD
     */
    getLocalDateString(date = new Date()) {
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
    }

    /**
     * Check if a record's time_period is on a given local date (YYYY-MM-DD)
     */
    isOnDate(record, targetDate) {
        const dt = record.prop('time_period')?.datetime();
        if (!dt) return false;
        const val = dt.value();
        if (!val?.d) return false;

        // Convert YYYYMMDD to YYYY-MM-DD
        const eventDate = val.d.slice(0, 4) + '-' + val.d.slice(4, 6) + '-' + val.d.slice(6, 8);

        // For ranges, check if targetDate falls within the range
        if (val.r?.d) {
            const endDate = val.r.d.slice(0, 4) + '-' + val.r.d.slice(4, 6) + '-' + val.r.d.slice(6, 8);
            return targetDate >= eventDate && targetDate <= endDate;
        }

        return eventDate === targetDate;
    }

    async onLoad() {
        // Wait for SyncHub to register tools
        window.addEventListener('synchub-ready', () => this.registerTools(), { once: true });
        if (window.syncHub) this.registerTools();

        // Debug helper
        window.calendarDebug = async (search = 'birthday') => {
            const collection = await this.getCollection(this.data);
            const records = await collection.getAllRecords();
            const r = records.find(r => r.getName().toLowerCase().includes(search.toLowerCase()));
            if (!r) return console.log('No record found matching:', search);

            const prop = r.prop('time_period');
            const dt = prop?.datetime();
            console.log('Record:', r.getName());
            console.log('prop:', prop);
            console.log('.date():', prop?.date());
            console.log('.datetime():', dt);
            console.log('.text():', prop?.text());
            if (dt) {
                console.log('dt keys:', Object.keys(dt));
                console.log('dt proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(dt)));
                console.log('dt.toDate():', dt.toDate?.());
                console.log('dt.value():', dt.value?.());
            }
            return { prop, dt, record: r };
        };
    }

    registerTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'Calendar',
            description: 'Calendar events from any source (Google, Outlook, Proton, iCal, etc.)',
            schema: {
                title: 'Event title',
                time_period: 'Event date/time',
                calendar: 'Primary | Work | Personal | Family',
                status: 'Confirmed | Tentative | Cancelled',
                location: 'Event location',
                attendees: 'Attendee names',
                meet_link: 'Video meeting URL',
                url: 'Event URL',
                prep: 'Prep done (checkbox)',
                energy: 'High | Medium | Low',
                outcome: 'Productive | Neutral | Waste',
                followup: 'Needs follow-up (checkbox)'
            },
            tools: [
                {
                    name: 'find',
                    description: 'Find events by calendar or status. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        calendar: { type: 'string', enum: ['Primary', 'Work', 'Personal', 'Family'], optional: true },
                        status: { type: 'string', enum: ['Confirmed', 'Tentative', 'Cancelled'], optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolFind(args, data)
                },
                {
                    name: 'today',
                    description: 'Get today\'s events. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        calendar: { type: 'string', optional: true }
                    },
                    handler: async (args, data) => this.toolToday(args, data)
                },
                {
                    name: 'upcoming',
                    description: 'Get upcoming events in the next N days. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        days: { type: 'number', description: 'Number of days ahead (default 7)', optional: true },
                        calendar: { type: 'string', optional: true },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolUpcoming(args, data)
                },
                {
                    name: 'needs_followup',
                    description: 'Get events marked as needing follow-up. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolNeedsFollowup(args, data)
                },
                {
                    name: 'search',
                    description: 'Search events by text in title or location. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        query: { type: 'string', description: 'Search text' },
                        limit: { type: 'number', optional: true }
                    },
                    handler: async (args, data) => this.toolSearch(args, data)
                }
            ]
        });

        console.log('[Calendar] Registered collection tools');
    }

    // =========================================================================
    // Tool Handlers
    // =========================================================================

    async getCollection(data) {
        const collections = await data.getAllCollections();
        return collections.find(c => c.getName() === 'Calendar');
    }

    async toolFind(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();
        let results = records;

        if (args.calendar) {
            results = results.filter(r => this.choiceMatches(r, 'calendar', args.calendar));
        }
        if (args.status) {
            results = results.filter(r => this.choiceMatches(r, 'status', args.status));
        }

        // Sort by time ascending
        results.sort((a, b) => {
            const dateA = a.prop('time_period')?.date() || new Date(0);
            const dateB = b.prop('time_period')?.date() || new Date(0);
            return dateA - dateB;
        });

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            when: this.formatDateTime(r),
            calendar: this.idToLabel(r.prop('calendar')?.choice(), 'calendar'),
            status: this.idToLabel(r.prop('status')?.choice(), 'status'),
            location: r.text('location')
        }));
    }

    async toolToday(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();
        const todayStr = this.getLocalDateString();

        // Filter using Thymer's native date format (no timezone conversion issues)
        let results = records.filter(r => this.isOnDate(r, todayStr));

        if (args.calendar) {
            results = results.filter(r => this.choiceMatches(r, 'calendar', args.calendar));
        }

        // Sort by time (all-day events first, then by time)
        results.sort((a, b) => {
            const dtA = a.prop('time_period')?.datetime()?.value();
            const dtB = b.prop('time_period')?.datetime()?.value();
            // All-day events (no time) come first
            if (!dtA?.t && dtB?.t) return -1;
            if (dtA?.t && !dtB?.t) return 1;
            // Both have time: compare time strings
            if (dtA?.t?.t && dtB?.t?.t) return dtA.t.t.localeCompare(dtB.t.t);
            return 0;
        });

        return {
            date: todayStr,
            count: results.length,
            events: results.map(r => ({
                guid: r.guid,
                title: r.getName(),
                when: this.formatDateTime(r),
                calendar: this.idToLabel(r.prop('calendar')?.choice(), 'calendar'),
                location: r.text('location'),
                meet_link: r.text('meet_link'),
                prep: r.prop('prep')?.choice() === 'yes'
            }))
        };
    }

    async toolUpcoming(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();
        const days = args.days || 7;

        // Calculate date range in local timezone
        const todayStr = this.getLocalDateString();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
        const endStr = this.getLocalDateString(endDate);

        // Filter events within the date range
        let results = records.filter(r => {
            const dt = r.prop('time_period')?.datetime();
            if (!dt) return false;
            const val = dt.value();
            if (!val?.d) return false;
            const eventDate = val.d.slice(0, 4) + '-' + val.d.slice(4, 6) + '-' + val.d.slice(6, 8);
            return eventDate >= todayStr && eventDate <= endStr;
        });

        if (args.calendar) {
            results = results.filter(r => this.choiceMatches(r, 'calendar', args.calendar));
        }

        // Sort by date then time
        results.sort((a, b) => {
            const dtA = a.prop('time_period')?.datetime()?.value();
            const dtB = b.prop('time_period')?.datetime()?.value();
            // Compare dates first
            if (dtA?.d !== dtB?.d) return (dtA?.d || '').localeCompare(dtB?.d || '');
            // All-day events first within same day
            if (!dtA?.t && dtB?.t) return -1;
            if (dtA?.t && !dtB?.t) return 1;
            // Compare times
            return (dtA?.t?.t || '').localeCompare(dtB?.t?.t || '');
        });

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return {
            period: `${todayStr} to ${endStr}`,
            count: results.length,
            events: results.map(r => ({
                guid: r.guid,
                title: r.getName(),
                when: this.formatDateTime(r),
                calendar: this.idToLabel(r.prop('calendar')?.choice(), 'calendar'),
                location: r.text('location'),
                prep: r.prop('prep')?.choice() === 'yes'
            }))
        };
    }

    async toolNeedsFollowup(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();

        let results = records.filter(r => r.prop('followup')?.choice() === 'yes');

        // Sort by date descending (most recent first)
        results.sort((a, b) => {
            const dtA = a.prop('time_period')?.datetime()?.value();
            const dtB = b.prop('time_period')?.datetime()?.value();
            return (dtB?.d || '').localeCompare(dtA?.d || '');
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            when: this.formatDateTime(r),
            calendar: this.idToLabel(r.prop('calendar')?.choice(), 'calendar'),
            outcome: this.idToLabel(r.prop('outcome')?.choice(), 'outcome')
        }));
    }

    async toolSearch(args, data) {
        if (!args.query) return { error: 'Query required' };

        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();
        const queryLower = args.query.toLowerCase();

        let results = records.filter(r => {
            const title = r.getName()?.toLowerCase() || '';
            const location = r.text('location')?.toLowerCase() || '';
            const attendees = r.text('attendees')?.toLowerCase() || '';
            return title.includes(queryLower) || location.includes(queryLower) || attendees.includes(queryLower);
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            when: this.formatDateTime(r),
            calendar: this.idToLabel(r.prop('calendar')?.choice(), 'calendar'),
            location: r.text('location')
        }));
    }
}
