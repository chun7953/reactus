export function createCalendarEventsRunLoader(calendar, listOptions) {
    const cache = new Map();

    return async function listCalendarEvents(calendarId) {
        const id = String(calendarId || '').trim();
        if (!id) throw new Error('Calendar event listing requires a calendar ID');
        if (cache.has(id)) return cache.get(id);

        const response = await calendar.events.list({
            calendarId: id,
            ...listOptions,
        });
        cache.set(id, response);
        return response;
    };
}
