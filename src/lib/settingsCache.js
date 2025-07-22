// src/lib/settingsCache.js

import { initializeDatabase } from '../db/database.js';

const reactionCache = new Map();
const announcementCache = new Map();
const monitorCache = new Map();
const configCache = new Map();
const giveawayCache = new Map();
const scheduledGiveawayCache = new Map();

let pool;

export async function getDBPool() {
    if (!pool) {
        pool = await initializeDatabase();
    }
    return pool;
}

export async function initializeCache() {
    console.log('[Cache] 全設定のキャッシュを開始します...');
    const db = await getDBPool();

    reactionCache.clear();
    const reactions = (await db.query('SELECT * FROM reactions')).rows;
    for (const r of reactions) {
        const guildCache = reactionCache.get(r.guild_id) || [];
        guildCache.push(r);
        reactionCache.set(r.guild_id, guildCache);
    }

    announcementCache.clear();
    const announcements = (await db.query('SELECT * FROM announcements')).rows;
    for (const a of announcements) {
        const guildCache = announcementCache.get(a.guild_id) || new Map();
        guildCache.set(a.channel_id, a);
        announcementCache.set(a.guild_id, guildCache);
    }
    
    monitorCache.clear();
    const monitors = (await db.query('SELECT * FROM calendar_monitors')).rows;
    for (const m of monitors) {
        const guildCache = monitorCache.get(m.guild_id) || [];
        guildCache.push(m);
        monitorCache.set(m.guild_id, guildCache);
    }

    configCache.clear();
    const configs = (await db.query('SELECT * FROM guild_configs')).rows;
    for (const c of configs) {
        configCache.set(c.guild_id, c);
    }

    giveawayCache.clear();
    const giveaways = (await db.query("SELECT * FROM giveaways WHERE status = 'RUNNING'")).rows;
    for (const g of giveaways) {
        const guildCache = giveawayCache.get(g.guild_id) || new Map();
        guildCache.set(g.message_id, g);
        giveawayCache.set(g.guild_id, guildCache);
    }
    
    scheduledGiveawayCache.clear();
    const scheduledGiveaways = (await db.query('SELECT * FROM scheduled_giveaways')).rows;
    for (const sg of scheduledGiveaways) {
        const guildCache = scheduledGiveawayCache.get(sg.guild_id) || [];
        guildCache.push(sg);
        scheduledGiveawayCache.set(sg.guild_id, guildCache);
    }
    
    console.log(`[Cache] キャッシュ完了 (リアクション: ${reactions.length}, アナウンス: ${announcements.length}, モニター: ${monitors.length}, サーバー設定: ${configs.length}, 進行中Giveaway: ${giveaways.length}, 予約Giveaway: ${scheduledGiveaways.length})`);
}

// --- Getter Functions ---
export const get = {
    reactionSettings: (guildId) => reactionCache.get(guildId) || [],
    announcement: (guildId, channelId) => (announcementCache.get(guildId) || new Map()).get(channelId),
    monitorsByGuild: (guildId) => monitorCache.get(guildId) || [],
    allMonitors: () => Array.from(monitorCache.values()).flat(),
    guildConfig: (guildId) => configCache.get(guildId) || { guild_id: guildId, main_calendar_id: null, giveaway_manager_roles: [] },
    activeGiveaways: (guildId) => Array.from((giveawayCache.get(guildId) || new Map()).values()),
    allActiveGiveaways: () => Array.from(giveawayCache.values()).flatMap(map => Array.from(map.values())),
    scheduledGiveaways: (guildId) => scheduledGiveawayCache.get(guildId) || [],
    allScheduledGiveaways: () => Array.from(scheduledGiveawayCache.values()).flat(),
};

// --- Setter/Update Functions (for direct cache manipulation) ---
export const cache = {
    addReactionSetting: (setting) => {
        const guildCache = reactionCache.get(setting.guild_id) || [];
        guildCache.push(setting);
        reactionCache.set(setting.guild_id, guildCache);
    },
    removeReactionSetting: (guildId, channelId, trigger) => {
        const guildCache = reactionCache.get(guildId) || [];
        reactionCache.set(guildId, guildCache.filter(s => !(s.channel_id === channelId && s.trigger === trigger)));
    },
    setAnnouncement: (setting) => {
        const guildCache = announcementCache.get(setting.guild_id) || new Map();
        guildCache.set(setting.channel_id, setting);
        announcementCache.set(setting.guild_id, guildCache);
    },
    removeAnnouncement: (guildId, channelId) => {
        const guildCache = announcementCache.get(guildId);
        if (guildCache) guildCache.delete(channelId);
    },
    addCalendarMonitor: (setting) => {
        const guildCache = monitorCache.get(setting.guild_id) || [];
        guildCache.push(setting);
        monitorCache.set(setting.guild_id, guildCache);
    },
    removeCalendarMonitor: (guildId, channelId, triggerKeyword) => {
        const guildCache = monitorCache.get(guildId) || [];
        monitorCache.set(guildId, guildCache.filter(m => !(m.channel_id === channelId && m.trigger_keyword === triggerKeyword)));
    },
    setGuildConfig: (config) => {
        configCache.set(config.guild_id, config);
    },
    addGiveaway: (giveaway) => {
        const guildCache = giveawayCache.get(giveaway.guild_id) || new Map();
        guildCache.set(giveaway.message_id, giveaway);
        giveawayCache.set(giveaway.guild_id, guildCache);
    },
    updateGiveaway: (guildId, messageId, updates) => {
        const guildCache = giveawayCache.get(guildId);
        if (guildCache?.has(messageId)) {
            guildCache.set(messageId, { ...guildCache.get(messageId), ...updates });
        }
    },
    removeGiveaway: (guildId, messageId) => {
        const guildCache = giveawayCache.get(guildId);
        if (guildCache) guildCache.delete(messageId);
    },
    addScheduledGiveaway: (scheduled) => {
        const guildCache = scheduledGiveawayCache.get(scheduled.guild_id) || [];
        guildCache.push(scheduled);
        scheduledGiveawayCache.set(scheduled.guild_id, guildCache);
    },
    removeScheduledGiveaway: (guildId, id) => {
        const guildCache = scheduledGiveawayCache.get(guildId) || [];
        scheduledGiveawayCache.set(guildId, guildCache.filter(s => s.id !== id));
    }
};