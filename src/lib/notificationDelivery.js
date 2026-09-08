import { applyConfiguredAutoReactions } from './autoReactionService.js';

const RECORD_NOTIFICATION_SQL =
    'INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING';

export async function recordNotification(pool, eventId) {
    await pool.query(RECORD_NOTIFICATION_SQL, [eventId]);
}

export async function deliverAndRecordNotification(pool, eventId, deliver) {
    const result = await deliver();

    // Calendar notifications are messages created by Reactus itself. Apply the
    // configured reaction immediately instead of depending only on a later
    // MessageCreate gateway event. A reaction failure must never make an
    // already-delivered calendar post retry and duplicate itself.
    try {
        await applyConfiguredAutoReactions(result);
    } catch (error) {
        console.error('[NotificationDelivery] 自動リアクションの適用に失敗:', error);
    }

    await recordNotification(pool, eventId);
    return result;
}
