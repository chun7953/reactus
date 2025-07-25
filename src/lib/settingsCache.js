// src/lib/settingsCache.js (修正後・完全版)

import { initializeDatabase } from '../db/database.js';

let pool;

export async function getDBPool() {
    if (!pool) {
        pool = await initializeDatabase();
    }
    return pool;
}

// --- Getter Functions (データベースから直接取得) ---
export const get = {
    reactionSettings: async (guildId) => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM reactions WHERE guild_id = $1', [guildId]);
        return res.rows || [];
    },
    announcement: async (guildId, channelId) => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM announcements WHERE guild_id = $1 AND channel_id = $2', [guildId, channelId]);
        return res.rows[0];
    },
    monitorsByGuild: async (guildId) => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM calendar_monitors WHERE guild_id = $1', [guildId]);
        return res.rows || [];
    },
    allMonitors: async () => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM calendar_monitors');
        return res.rows || [];
    },
    guildConfig: async (guildId) => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM guild_configs WHERE guild_id = $1', [guildId]);
        return res.rows[0] || { guild_id: guildId, main_calendar_id: null, giveaway_manager_roles: [] };
    },
    activeGiveaways: async (guildId) => {
        const db = await getDBPool();
        const res = await db.query("SELECT * FROM giveaways WHERE guild_id = $1 AND status = 'RUNNING'", [guildId]);
        return res.rows || [];
    },
    allActiveGiveaways: async () => {
        const db = await getDBPool();
        const res = await db.query("SELECT * FROM giveaways WHERE status = 'RUNNING'");
        return res.rows || [];
    },
    scheduledGiveaways: async (guildId) => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM scheduled_giveaways WHERE guild_id = $1', [guildId]);
        return res.rows || [];
    },
    allScheduledGiveaways: async () => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM scheduled_giveaways');
        return res.rows || [];
    },
};

// initializeCache 関数は不要になったため削除します。