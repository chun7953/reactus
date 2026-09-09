const MASTER_PREFETCH_CONCURRENCY = 8;
const CALENDAR_LIST_TIMEOUT_MS = 12_000;
const MASTER_LOOKUP_TIMEOUT_MS = 5_000;
const MASTER_PRIVATE_PROPERTIES = Symbol.for('reactus.calendarMasterPrivateProperties');

async function prefetchRecurringMasterMetadata(calendar, calendarId, items) {
    const recurringIds = [...new Set(
        items
            .map(item => item?.recurringEventId)
            .filter(Boolean),
    )];
    if (!calendarId || recurringIds.length === 0 || typeof calendar?.events?.get !== 'function') return;

    const metadataById = new Map();
    let cursor = 0;

    async function worker() {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= recurringIds.length) return;
            const recurringEventId = recurringIds[index];
            try {
                const response = await calendar.events.get({
                    calendarId,
                    eventId: recurringEventId,
                }, { timeout: MASTER_LOOKUP_TIMEOUT_MS });
                metadataById.set(
                    recurringEventId,
                    response.data?.extendedProperties?.private || {},
                );
            } catch (error) {
                console.warn(
                    `[CalendarMetadata] 定期予定 ${recurringEventId} の元データ取得に失敗:`,
                    error?.message || error,
                );
                metadataById.set(recurringEventId, {});
            }
        }
    }

    const workerCount = Math.min(MASTER_PREFETCH_CONCURRENCY, recurringIds.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    for (const item of items) {
        if (!item?.recurringEventId || !metadataById.has(item.recurringEventId)) continue;
        Object.defineProperty(item, MASTER_PRIVATE_PROPERTIES, {
            configurable: true,
            enumerable: false,
            value: metadataById.get(item.recurringEventId),
        });
    }
}

export async function listAllCalendarEvents(calendar, params) {
    const items = [];
    let pageToken = undefined;
    do {
        const response = await calendar.events.list({
            ...params,
            maxResults: params.maxResults || 250,
            ...(pageToken ? { pageToken } : {}),
        }, { timeout: CALENDAR_LIST_TIMEOUT_MS });
        items.push(...(response.data.items || []));
        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    await prefetchRecurringMasterMetadata(calendar, params.calendarId, items);
    return items;
}

export const calendarEventPagerTimeouts = Object.freeze({
    listMs: CALENDAR_LIST_TIMEOUT_MS,
    masterLookupMs: MASTER_LOOKUP_TIMEOUT_MS,
});
