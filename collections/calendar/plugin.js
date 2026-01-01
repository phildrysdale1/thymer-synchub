/**
 * Calendar Collection - Collection Plugin
 *
 * Provides query tools for the Calendar collection.
 * Works with any source: Google, Outlook, Proton, iCal, etc.
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
            results = results.filter(r => r.prop('calendar')?.choice() === args.calendar);
        }
        if (args.status) {
            results = results.filter(r => r.prop('status')?.choice() === args.status);
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
            time: r.prop('time_period')?.date()?.toISOString(),
            calendar: r.prop('calendar')?.choice(),
            status: r.prop('status')?.choice(),
            location: r.text('location')
        }));
    }

    async toolToday(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let results = records.filter(r => {
            const eventDate = r.prop('time_period')?.date();
            return eventDate && eventDate >= today && eventDate < tomorrow;
        });

        if (args.calendar) {
            results = results.filter(r => r.prop('calendar')?.choice() === args.calendar);
        }

        // Sort by time
        results.sort((a, b) => {
            const dateA = a.prop('time_period')?.date() || new Date(0);
            const dateB = b.prop('time_period')?.date() || new Date(0);
            return dateA - dateB;
        });

        return {
            date: today.toISOString().split('T')[0],
            count: results.length,
            events: results.map(r => ({
                guid: r.guid,
                title: r.getName(),
                time: r.prop('time_period')?.date()?.toISOString(),
                calendar: r.prop('calendar')?.choice(),
                location: r.text('location'),
                meet_link: r.text('meet_link'),
                prep: r.prop('prep')?.checked()
            }))
        };
    }

    async toolUpcoming(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();
        const now = new Date();
        const days = args.days || 7;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + days);

        let results = records.filter(r => {
            const eventDate = r.prop('time_period')?.date();
            return eventDate && eventDate >= now && eventDate <= endDate;
        });

        if (args.calendar) {
            results = results.filter(r => r.prop('calendar')?.choice() === args.calendar);
        }

        // Sort by time
        results.sort((a, b) => {
            const dateA = a.prop('time_period')?.date() || new Date(0);
            const dateB = b.prop('time_period')?.date() || new Date(0);
            return dateA - dateB;
        });

        const limit = args.limit || 20;
        results = results.slice(0, limit);

        return {
            period: `Next ${days} days`,
            count: results.length,
            events: results.map(r => ({
                guid: r.guid,
                title: r.getName(),
                time: r.prop('time_period')?.date()?.toISOString(),
                calendar: r.prop('calendar')?.choice(),
                location: r.text('location'),
                prep: r.prop('prep')?.checked()
            }))
        };
    }

    async toolNeedsFollowup(args, data) {
        const collection = await this.getCollection(data);
        if (!collection) return { error: 'Calendar collection not found' };

        const records = await collection.getAllRecords();

        let results = records.filter(r => r.prop('followup')?.checked());

        // Sort by time descending (most recent first)
        results.sort((a, b) => {
            const dateA = a.prop('time_period')?.date() || new Date(0);
            const dateB = b.prop('time_period')?.date() || new Date(0);
            return dateB - dateA;
        });

        const limit = args.limit || 10;
        results = results.slice(0, limit);

        return results.map(r => ({
            guid: r.guid,
            title: r.getName(),
            time: r.prop('time_period')?.date()?.toISOString(),
            calendar: r.prop('calendar')?.choice(),
            outcome: r.prop('outcome')?.choice()
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
            time: r.prop('time_period')?.date()?.toISOString(),
            calendar: r.prop('calendar')?.choice(),
            location: r.text('location')
        }));
    }
}
