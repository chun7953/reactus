function encodePart(value) {
    const text = String(value);
    return `${text.length}:${text}`;
}

export function buildCalendarNotificationKey(monitor, eventId) {
    const parts = [monitor?.guild_id, monitor?.channel_id, monitor?.trigger_keyword, eventId];
    if (parts.some(value => value === undefined || value === null || value === '')) {
        throw new Error('Calendar notification key requires guild, channel, trigger, and event IDs');
    }

    return parts.map(encodePart).join('|');
}
