import { providerTelemetry } from './providerTelemetry.js';

export function createCalendarEventsRunLoader(
    calendar,
    listOptions,
    { telemetry = providerTelemetry } = {},
) {
    const cache = new Map();

    return async function listCalendarEvents(calendarId) {
        const id = String(calendarId || '').trim();
        if (!id) throw new Error('Calendar event listing requires a calendar ID');
        if (cache.has(id)) return cache.get(id);

        telemetry.recordGoogleCalendarMonitorListRequest();
        let response;
        try {
            response = await calendar.events.list({
                calendarId: id,
                ...listOptions,
            });
        } catch (error) {
            telemetry.recordGoogleCalendarMonitorListFailure(error);
            throw error;
        }
        cache.set(id, response);
        return response;
    };
}
