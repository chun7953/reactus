export async function resolveCalendarEventPrivateProperties(
    calendar,
    calendarId,
    event,
    masterCache = new Map(),
) {
    const instanceProperties = event?.extendedProperties?.private || {};
    const recurringEventId = event?.recurringEventId;
    if (!recurringEventId) return { ...instanceProperties };

    const cacheKey = `${calendarId}:${recurringEventId}`;
    let masterProperties;
    if (masterCache.has(cacheKey)) {
        masterProperties = masterCache.get(cacheKey);
    } else {
        try {
            const response = await calendar.events.get({
                calendarId,
                eventId: recurringEventId,
            });
            masterProperties = response.data?.extendedProperties?.private || {};
        } catch (error) {
            // Posting should remain possible even if the master lookup fails.
            // The expanded instance may still contain all metadata we need.
            console.warn(
                `[CalendarMetadata] 定期予定 ${recurringEventId} の元データ取得に失敗:`,
                error?.message || error,
            );
            masterProperties = {};
        }
        masterCache.set(cacheKey, masterProperties);
    }

    return {
        ...masterProperties,
        ...instanceProperties,
    };
}
