const RECORD_NOTIFICATION_SQL =
    'INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING';

export async function recordNotification(pool, eventId) {
    await pool.query(RECORD_NOTIFICATION_SQL, [eventId]);
}

export async function deliverAndRecordNotification(pool, eventId, deliver) {
    const result = await deliver();
    await recordNotification(pool, eventId);
    return result;
}
