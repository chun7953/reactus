const MASTER_PRIVATE_PROPERTIES = Symbol.for('reactus.calendarMasterPrivateProperties');

export async function resolveCalendarEventPrivateProperties(
    calendar,
    calendarId,
    event,
    masterCache = new Map(),
) {
    const instanceProperties = event?.extendedProperties?.private || {};
    const recurringEventId = event?.recurringEventId;
    if (!recurringEventId) return { ...instanceProperties };

    if (Object.prototype.hasOwnProperty.call(event || {}, MASTER_PRIVATE_PROPERTIES)) {
        return {
            ...(event[MASTER_PRIVATE_PROPERTIES] || {}),
            ...instanceProperties,
        };
    }

    const cacheKey = `${calendarId}:${recurringEventId}`;
    let masterProperties;
    if (masterCache.has(cacheKey)) {
        masterProperties = await masterCache.get(cacheKey);
    } else {
        const lookup = (async () => {
            try {
                const response = await calendar.events.get({
                    calendarId,
                    eventId: recurringEventId,
                });
                return response.data?.extendedProperties?.private || {};
            } catch (error) {
                // Posting should remain possible even if the master lookup fails.
                // The expanded instance may still contain all metadata we need.
                console.warn(
                    `[CalendarMetadata] 定期予定 ${recurringEventId} の元データ取得に失敗:`,
                    error?.message || error,
                );
                return {};
            }
        })();
        masterCache.set(cacheKey, lookup);
        masterProperties = await lookup;
        masterCache.set(cacheKey, masterProperties);
    }

    return {
        ...masterProperties,
        ...instanceProperties,
    };
}
