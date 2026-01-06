const VERSION = 'v1.0.3';
/**
 * Calendar Collection - Collection Plugin
 *
 * Provides query tools for the Calendar collection.
 * Works with any source: Google, Outlook, Proton, iCal, etc.
 */

// Meeting URL patterns - order matters (more specific first)
const MEETING_PATTERNS = [
    // Microsoft Teams
    /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+/i,
    // Google Meet
    /https:\/\/meet\.google\.com\/[a-z0-9-]+/i,
    // Zoom (various subdomains)
    /https:\/\/[a-z0-9-]*\.?zoom\.us\/j\/[^\s<>"]+/i,
    // Webex
    /https:\/\/[a-z0-9-]+\.webex\.com\/[^\s<>"]+/i,
    // Generic fallback - any https URL (last resort)
    // /https:\/\/[^\s<>"]+/i,
];

/**
 * Extract meeting link from text (description, location, etc.)
 * Tries known meeting providers first, then falls back to generic URLs.
 *
 * @param {...string} texts - Text fields to search (description, location, etc.)
 * @returns {string|null} - Meeting URL or null
 */
function parseMeetingLink(...texts) {
    const combined = texts.filter(Boolean).join(' ');
    if (!combined) return null;

    // Try each pattern in order
    for (const pattern of MEETING_PATTERNS) {
        const match = combined.match(pattern);
        if (match) {
            // Clean up the URL (remove trailing punctuation, etc.)
            let url = match[0];
            // Remove trailing > or " that might be captured
            url = url.replace(/[>"]+$/, '');
            return url;
        }
    }

    return null;
}

// Export for use by sync plugins
if (typeof window !== 'undefined') {
    window.calendarUtils = window.calendarUtils || {};
    window.calendarUtils.parseMeetingLink = parseMeetingLink;
}

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

    TIMING_LABEL_TO_ID = {
        'Upcoming': 'upcoming',
        'Past': 'past'
    };

    // Convert label to ID for filtering
    labelToId(label, type = 'calendar') {
        const maps = {
            calendar: this.CALENDAR_LABEL_TO_ID,
            status: this.STATUS_LABEL_TO_ID,
            energy: this.ENERGY_LABEL_TO_ID,
            outcome: this.OUTCOME_LABEL_TO_ID,
            timing: this.TIMING_LABEL_TO_ID
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
            outcome: this.OUTCOME_LABEL_TO_ID,
            timing: this.TIMING_LABEL_TO_ID
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

    /**
     * Check if an event is in the past.
     * For timed events: past if end time (or start + 1hr) has passed.
     * For all-day events: past if the date is before today.
     */
    isEventPast(record) {
        const dt = record.prop('time_period')?.datetime();
        if (!dt) return false;

        const val = dt.value();
        if (!val?.d) return false;

        const now = new Date();
        const todayStr = this.getLocalDateString();
        const eventDate = val.d.slice(0, 4) + '-' + val.d.slice(4, 6) + '-' + val.d.slice(6, 8);

        // For ranges, check the end date
        if (val.r?.d) {
            const endDate = val.r.d.slice(0, 4) + '-' + val.r.d.slice(4, 6) + '-' + val.r.d.slice(6, 8);
            // If end date has end time, check that
            if (val.r.t?.t) {
                if (endDate < todayStr) return true;
                if (endDate > todayStr) return false;
                // Same day - check time
                const endHour = parseInt(val.r.t.t.slice(0, 2));
                const endMin = parseInt(val.r.t.t.slice(2, 4));
                return now.getHours() > endHour || (now.getHours() === endHour && now.getMinutes() >= endMin);
            }
            // All-day range: past if end date is before today
            return endDate < todayStr;
        }

        // Single event with time
        if (val.t?.t) {
            if (eventDate < todayStr) return true;
            if (eventDate > todayStr) return false;
            // Same day - check if 1 hour after start has passed
            const startHour = parseInt(val.t.t.slice(0, 2));
            const startMin = parseInt(val.t.t.slice(2, 4));
            const eventTime = new Date();
            eventTime.setHours(startHour, startMin, 0, 0);
            const oneHourAfter = new Date(eventTime.getTime() + 60 * 60 * 1000);
            return now >= oneHourAfter;
        }

        // All-day single event: past if before today
        return eventDate < todayStr;
    }

    /**
     * Update the timing field for all calendar events.
     * Runs every 30 minutes to mark past events.
     */
    async updateEventTiming() {
        try {
            const collection = await this.getCollection(this.data);
            if (!collection) return;

            const records = await collection.getAllRecords();
            let updated = 0;

            for (const record of records) {
                const currentTiming = record.prop('timing')?.choice();
                const isPast = this.isEventPast(record);
                const shouldBe = isPast ? 'past' : 'upcoming';

                // Only update if different
                if (currentTiming !== shouldBe) {
                    record.prop('timing')?.setChoice(isPast ? 'Past' : 'Upcoming');
                    updated++;
                }
            }

            if (updated > 0) {
                console.log(`[Calendar] Updated timing for ${updated} events`);
            }
        } catch (e) {
            console.error('[Calendar] Error updating event timing:', e);
        }
    }

    async onLoad() {
        // Wait for SyncHub to register tools
        window.addEventListener('synchub-ready', () => this.registerTools(), { once: true });
        if (window.syncHub) this.registerTools();

        // Meeting status bar
        this.setupMeetingStatusBar();

        // Update timing field every 30 minutes
        this.updateEventTiming();
        setInterval(() => this.updateEventTiming(), 30 * 60 * 1000);
    }

    // =========================================================================
    // Meeting Status Bar
    // =========================================================================

    setupMeetingStatusBar() {
        this.nextMeeting = null;
        this.meetingPopup = null;

        this.meetingStatus = this.ui.addStatusBarItem({
            htmlLabel: this.buildMeetingLabel(''),
            tooltip: 'No upcoming meetings',
            onClick: () => this.showMeetingPopup()
        });

        // Update every minute
        this.updateMeetingStatus();
        setInterval(() => this.updateMeetingStatus(), 60000);
    }

    buildMeetingLabel(countdown, urgent = false) {
        const baseStyle = 'font-size: 16px; vertical-align: middle;';
        const iconColor = '#2dd4bf'; // Turquoise/teal
        const textColor = urgent ? iconColor : 'var(--text-muted)';
        const icon = `<span class="ti ti-calendar-event" style="${baseStyle} color: ${iconColor};"></span>`;
        if (countdown) {
            return `${icon}<span style="margin-left: 4px; font-size: 12px; vertical-align: middle; color: ${textColor};">${countdown}</span>`;
        }
        return icon;
    }

    async updateMeetingStatus() {
        try {
            const collection = await this.getCollection(this.data);
            if (!collection) return;

            const records = await collection.getAllRecords();
            const now = new Date();
            const todayStr = this.getLocalDateString();

            // Find upcoming or ongoing meetings with meet_link, today only
            const upcoming = records
                .filter(r => {
                    // Has a meeting link (meet_link field, or parsed from description/location)
                    if (!this.getMeetingLink(r)) return false;

                    const dt = r.prop('time_period')?.datetime();
                    if (!dt) return false;
                    const val = dt.value();
                    if (!val?.d || !val?.t) return false; // Skip all-day events

                    // Must be today
                    const eventDate = val.d.slice(0, 4) + '-' + val.d.slice(4, 6) + '-' + val.d.slice(6, 8);
                    if (eventDate !== todayStr) return false;

                    const eventTime = dt.toDate();

                    // Include if: hasn't ended yet (check end time if available)
                    if (val.r?.t?.t) {
                        // Has end time - check if meeting has ended
                        const endHour = parseInt(val.r.t.t.slice(0, 2));
                        const endMin = parseInt(val.r.t.t.slice(2, 4));
                        const endTime = new Date(eventTime);
                        endTime.setHours(endHour, endMin, 0, 0);
                        return now < endTime;
                    }

                    // No end time - show for 1 hour after start
                    const oneHourAfter = new Date(eventTime.getTime() + 60 * 60 * 1000);
                    return now < oneHourAfter;
                })
                .sort((a, b) => {
                    const dtA = a.prop('time_period')?.datetime()?.value();
                    const dtB = b.prop('time_period')?.datetime()?.value();
                    return (dtA?.t?.t || '').localeCompare(dtB?.t?.t || '');
                });

            this.nextMeeting = upcoming[0] || null;

            if (this.nextMeeting) {
                const dt = this.nextMeeting.prop('time_period')?.datetime();
                const val = dt?.value();
                const eventTime = dt?.toDate();
                const minsUntil = Math.round((eventTime - now) / 60000);
                const title = this.nextMeeting.getName();

                // Calculate end time for "next Xm" display
                let minsUntilEnd = null;
                if (val?.r?.t?.t) {
                    const endHour = parseInt(val.r.t.t.slice(0, 2));
                    const endMin = parseInt(val.r.t.t.slice(2, 4));
                    const endTime = new Date(eventTime);
                    endTime.setHours(endHour, endMin, 0, 0);
                    minsUntilEnd = Math.round((endTime - now) / 60000);
                }

                const countdown = this.formatCountdown(minsUntil, minsUntilEnd);
                const urgent = minsUntil <= 30; // Highlight when ≤30m away or ongoing
                this.meetingStatus.setHtmlLabel(this.buildMeetingLabel(countdown, urgent));
                this.meetingStatus.setTooltip(`${title} at ${this.formatTime(eventTime)}`);
            } else {
                this.meetingStatus.setHtmlLabel(this.buildMeetingLabel(''));
                this.meetingStatus.setTooltip('No upcoming meetings today');
            }
        } catch (e) {
            console.error('[Calendar] Status bar update error:', e);
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatCountdown(minsUntil, minsUntilEnd = null) {
        if (minsUntil <= 0) {
            // Meeting ongoing - show time until end
            if (minsUntilEnd !== null && minsUntilEnd > 0) {
                return `next ${minsUntilEnd}m`;
            }
            return 'now';
        } else if (minsUntil <= 119) {
            // Under 2 hours - show minutes
            return `in ${minsUntil}m`;
        } else {
            // 2+ hours - show hours
            const hours = minsUntil / 60;
            const rounded = Math.round(hours * 2) / 2; // Round to nearest 0.5
            if (rounded % 1 === 0) {
                return `in ${rounded}h`;
            } else {
                return `in ${rounded}h`;
            }
        }
    }

    getMeetingLink(record) {
        // First check the meet_link field (should be populated by sync)
        const meetLink = record.text('meet_link');
        if (meetLink) return meetLink;

        // Fallback: try to parse from description and location
        // (for events synced before the parsing was added)
        const description = record.text('description') || '';
        const location = record.text('location') || '';
        return parseMeetingLink(description, location);
    }

    showMeetingPopup() {
        if (this.meetingPopup) {
            this.closeMeetingPopup();
            return;
        }

        if (!this.nextMeeting) {
            return;
        }

        const title = this.nextMeeting.getName();
        const dt = this.nextMeeting.prop('time_period')?.datetime();
        const when = this.formatDateTime(this.nextMeeting);
        const location = this.nextMeeting.text('location') || '';
        const meetLink = this.getMeetingLink(this.nextMeeting);

        this.meetingPopup = document.createElement('div');
        this.meetingPopup.className = 'calendar-meeting-popup';
        this.meetingPopup.innerHTML = `
            <div class="meeting-popup-header">
                <span class="meeting-popup-title">${this.escapeHtml(title)}</span>
                <button class="meeting-popup-close">×</button>
            </div>
            <div class="meeting-popup-time">${when?.time || 'All day'} ${when?.end_time ? '- ' + when.end_time : ''}</div>
            ${location ? `<div class="meeting-popup-location">${this.escapeHtml(location)}</div>` : ''}
            ${meetLink ? `<button class="meeting-popup-join">Join Meeting</button>` : ''}
        `;

        // Style the popup
        Object.assign(this.meetingPopup.style, {
            position: 'fixed',
            bottom: '40px',
            right: '10px',
            background: 'var(--background-primary, #1e1e1e)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: '8px',
            padding: '12px',
            minWidth: '250px',
            maxWidth: '350px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: '10000',
            fontFamily: 'inherit',
            fontSize: '13px'
        });

        // Style header
        const header = this.meetingPopup.querySelector('.meeting-popup-header');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
        });

        const titleEl = this.meetingPopup.querySelector('.meeting-popup-title');
        Object.assign(titleEl.style, {
            fontWeight: '600',
            fontSize: '14px',
            color: 'var(--text-primary, #fff)',
            flex: '1',
            marginRight: '8px'
        });

        const closeBtn = this.meetingPopup.querySelector('.meeting-popup-close');
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #888)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0',
            lineHeight: '1'
        });
        closeBtn.onclick = () => this.closeMeetingPopup();

        const timeEl = this.meetingPopup.querySelector('.meeting-popup-time');
        Object.assign(timeEl.style, {
            color: 'var(--text-secondary, #aaa)',
            marginBottom: '4px'
        });

        const locationEl = this.meetingPopup.querySelector('.meeting-popup-location');
        if (locationEl) {
            Object.assign(locationEl.style, {
                color: 'var(--text-secondary, #888)',
                fontSize: '12px',
                marginBottom: '8px',
                wordBreak: 'break-word'
            });
        }

        const joinBtn = this.meetingPopup.querySelector('.meeting-popup-join');
        if (joinBtn) {
            Object.assign(joinBtn.style, {
                background: 'var(--accent-color, #4a9eff)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                cursor: 'pointer',
                width: '100%',
                marginTop: '8px',
                fontWeight: '500'
            });
            joinBtn.onclick = () => {
                window.open(meetLink, '_blank');
                this.closeMeetingPopup();
            };
        }

        document.body.appendChild(this.meetingPopup);

        // Close on outside click
        setTimeout(() => {
            this.meetingPopupClickHandler = (e) => {
                if (!this.meetingPopup?.contains(e.target)) {
                    this.closeMeetingPopup();
                }
            };
            document.addEventListener('click', this.meetingPopupClickHandler);
        }, 100);
    }

    closeMeetingPopup() {
        if (this.meetingPopup) {
            this.meetingPopup.remove();
            this.meetingPopup = null;
        }
        if (this.meetingPopupClickHandler) {
            document.removeEventListener('click', this.meetingPopupClickHandler);
            this.meetingPopupClickHandler = null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    registerTools() {
        if (!window.syncHub?.registerCollectionTools) return;

        window.syncHub.registerCollectionTools({
            collection: 'Calendar',
            version: VERSION,
            description: 'Calendar events from any source (Google, Outlook, Proton, iCal, etc.)',
            schema: {
                title: 'Event title',
                time_period: 'Event date/time',
                calendar: 'Primary | Work | Personal | Family',
                status: 'Confirmed | Tentative | Cancelled',
                timing: 'Upcoming | Past (auto-updated)',
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
                    description: 'Find events by calendar, status, or timing. Returns GUIDs - use [[GUID]] to link.',
                    parameters: {
                        calendar: { type: 'string', enum: ['Primary', 'Work', 'Personal', 'Family'], optional: true },
                        status: { type: 'string', enum: ['Confirmed', 'Tentative', 'Cancelled'], optional: true },
                        timing: { type: 'string', enum: ['Upcoming', 'Past'], optional: true },
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
        if (args.timing) {
            results = results.filter(r => this.choiceMatches(r, 'timing', args.timing));
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
            timing: this.idToLabel(r.prop('timing')?.choice(), 'timing'),
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
