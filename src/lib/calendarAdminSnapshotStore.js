import { getDBPool } from './settingsCache.js';

export async function readCalendarAdminSnapshot(guildId, forwardDays, pastDays) {
    const pool = await getDBPool();
    const result = await pool.query(
        `SELECT events, loaded_at
           FROM web_calendar_snapshots
          WHERE guild_id = $1 AND forward_days = $2 AND past_days = $3`,
        [String(guildId), Number(forwardDays), Number(pastDays)],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
        events: Array.isArray(row.events) ? row.events : [],
        loadedAt: new Date(row.loaded_at).getTime(),
    };
}

export async function writeCalendarAdminSnapshot(guildId, forwardDays, pastDays, events) {
    const pool = await getDBPool();
    await pool.query(
        `INSERT INTO web_calendar_snapshots (guild_id, forward_days, past_days, events, loaded_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT (guild_id, forward_days, past_days)
         DO UPDATE SET events = EXCLUDED.events, loaded_at = NOW()`,
        [String(guildId), Number(forwardDays), Number(pastDays), JSON.stringify(events || [])],
    );
}

export async function deleteCalendarAdminSnapshots(guildId) {
    const pool = await getDBPool();
    await pool.query('DELETE FROM web_calendar_snapshots WHERE guild_id = $1', [String(guildId)]);
}
