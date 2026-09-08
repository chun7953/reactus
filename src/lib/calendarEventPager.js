export async function listAllCalendarEvents(calendar, params) {
    const items = [];
    let pageToken = undefined;
    do {
        const response = await calendar.events.list({
            ...params,
            maxResults: params.maxResults || 250,
            ...(pageToken ? { pageToken } : {}),
        });
        items.push(...(response.data.items || []));
        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return items;
}
