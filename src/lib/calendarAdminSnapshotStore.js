import { getDBPool } from './settingsCache.js';

let ensurePromise = null;

async function ensureTable(pool) {
    if (!ensurePromise) {
        ensurePromise = pool.query(`
            CREATE TABLE IF NOT EXISTS web_calendar_snapshots (
                guild_id TEXT NOT NULL,
                forward_days INTEGER NOT NULL,
                past_days INTEGER NOT NULL,
                events JSONB NOT NULL,
                loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (guild_id, forward_days, past_days)
            )
        `).catch(error => {
            ensurePromise = null;
            throw error;
        });
    }
    await ensurePromise;
}

export async function readCalendarAdminSnapshot(guildId, forwardDays, pastDays) {
    const pool = await getDBPool();
    await ensureTable(pool);
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
    await ensureTable(pool);
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
    await ensureTable(pool);
    await pool.query('DELETE FROM web_calendar_snapshots WHERE guild_id = $1', [String(guildId)]);
}
