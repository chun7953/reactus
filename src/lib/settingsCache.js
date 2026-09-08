// src/lib/settingsCache.js

import { closeDatabase, initializeDatabase } from '../db/database.js';
import { createAsyncCache } from './asyncCache.js';

const HOT_SETTINGS_TTL_MS = 60_000;
const hotSettingsCache = createAsyncCache({ ttlMs: HOT_SETTINGS_TTL_MS });

function reactionKey(guildId) {
    return `reaction:${guildId}`;
}

function announcementKey(guildId, channelId) {
    return `announcement:${guildId}:${channelId}`;
}

export async function getDBPool() {
    return initializeDatabase();
}

export async function closeDBPool() {
    hotSettingsCache.clear();
    return closeDatabase();
}

export function invalidateReactionSettings(guildId) {
    hotSettingsCache.invalidate(reactionKey(guildId));
}

export function invalidateAnnouncement(guildId, channelId) {
    hotSettingsCache.invalidate(announcementKey(guildId, channelId));
}

export function invalidateGuildHotSettings(guildId) {
    const reactionPrefix = reactionKey(guildId);
    const announcementPrefix = `announcement:${guildId}:`;
    hotSettingsCache.invalidateWhere(key => key === reactionPrefix || key.startsWith(announcementPrefix));
}

export const get = {
    reactionSettings: async (guildId) => hotSettingsCache.get(reactionKey(guildId), async () => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM reactions WHERE guild_id = $1', [guildId]);
        return res.rows || [];
    }),
    announcement: async (guildId, channelId) => hotSettingsCache.get(announcementKey(guildId, channelId), async () => {
        const db = await getDBPool();
        const res = await db.query('SELECT * FROM announcements WHERE guild_id = $1 AND channel_id = $2', [guildId, channelId]);
        return res.rows[0];
    }),
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
