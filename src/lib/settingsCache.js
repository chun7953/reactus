// src/lib/settingsCache.js

import { initializeDatabase } from '../db/database.js';

// 各種設定を保存するキャッシュ
const reactionCache = new Map();
const announcementCache = new Map();
const monitorCache = new Map();
const configCache = new Map();
const giveawayCache = new Map();
const scheduledGiveawayCache = new Map();

// データベース接続プールを保持する変数
let pool;

/**
 * データベース接続プールを取得し、なければ初期化する
 * @returns {import('pg').Pool} データベース接続プール
 */
export async function getDBPool() {
    if (!pool) {
        pool = await initializeDatabase();
    }
    return pool;
}

/**
 * 起動時にデータベースからすべての設定を読み込み、キャッシュを初期化する
 */
export async function initializeCache() {
    console.log('[Cache] 全設定のキャッシュを開始します...');
    const db = await getDBPool();

    // 各キャッシュをクリア
    reactionCache.clear();
    announcementCache.clear();
    monitorCache.clear();
    configCache.clear();
    giveawayCache.clear();
    scheduledGiveawayCache.clear();

    // リアクション設定を読み込み
    const reactions = (await db.query('SELECT * FROM reactions')).rows;
    for (const r of reactions) {
        if (!reactionCache.has(r.guild_id)) reactionCache.set(r.guild_id, []);
        reactionCache.get(r.guild_id).push(r);
    }

    // アナウンス設定を読み込み
    const announcements = (await db.query('SELECT * FROM announcements')).rows;
    for (const a of announcements) {
        if (!announcementCache.has(a.guild_id)) announcementCache.set(a.guild_id, new Map());
        announcementCache.get(a.guild_id).set(a.channel_id, a);
    }

    // カレンダーモニター設定を読み込み
    const monitors = (await db.query('SELECT * FROM calendar_monitors')).rows;
    for (const m of monitors) {
        if (!monitorCache.has(m.guild_id)) monitorCache.set(m.guild_id, []);
        monitorCache.get(m.guild_id).push(m);
    }

    // サーバー個別設定を読み込み
    const configs = (await db.query('SELECT * FROM guild_configs')).rows;
    for (const c of configs) {
        configCache.set(c.guild_id, c);
    }

    // 進行中のGiveawayを読み込み
    const giveaways = (await db.query("SELECT * FROM giveaways WHERE status = 'RUNNING'")).rows;
    for (const g of giveaways) {
        if (!giveawayCache.has(g.guild_id)) giveawayCache.set(g.guild_id, new Map());
        giveawayCache.get(g.guild_id).set(g.message_id, g);
    }

    // 予約中のGiveawayを読み込み
    const scheduledGiveaways = (await db.query('SELECT * FROM scheduled_giveaways')).rows;
    for (const sg of scheduledGiveaways) {
        if (!scheduledGiveawayCache.has(sg.guild_id)) scheduledGiveawayCache.set(sg.guild_id, []);
        scheduledGiveawayCache.get(sg.guild_id).push(sg);
    }

    console.log(`[Cache] キャッシュ完了 (リアクション: ${reactions.length}件, アナウンス: ${announcements.length}件, モニター: ${monitors.length}件, サーバー設定: ${configs.length}件, 進行中Giveaway: ${giveaways.length}件, 予約Giveaway: ${scheduledGiveaways.length}件)`);
}

// --- キャッシュ取得（Getter）関数群 ---
export function getReactionSettings(guildId) { return reactionCache.get(guildId) || []; }
export function getAnnouncement(guildId, channelId) { return (announcementCache.get(guildId) || new Map()).get(channelId); }
export function getMonitorsByGuild(guildId) { return monitorCache.get(guildId) || []; }
export function getMonitors() { return Array.from(monitorCache.values()).flat(); }
export function getGuildConfig(guildId) { return configCache.get(guildId) || { guild_id: guildId, main_calendar_id: null, giveaway_manager_roles: [] }; }
export function getActiveGiveaways(guildId) { return Array.from((giveawayCache.get(guildId) || new Map()).values()); }
export function getAllActiveGiveaways() { return Array.from(giveawayCache.values()).flatMap(map => Array.from(map.values())); }
export function getScheduledGiveaways(guildId) { return scheduledGiveawayCache.get(guildId) || []; }
export function getAllScheduledGiveaways() { return Array.from(scheduledGiveawayCache.values()).flat(); }


// --- キャッシュ操作関数群 ---

// リアクション
export function addReactionSetting(setting) {
    const guildCache = reactionCache.get(setting.guild_id) || [];
    guildCache.push(setting);
    reactionCache.set(setting.guild_id, guildCache);
}
export function removeReactionSetting(guildId, channelId, trigger) {
    const guildCache = reactionCache.get(guildId) || [];
    const filtered = guildCache.filter(s => !(s.channel_id === channelId && s.trigger === trigger));
    reactionCache.set(guildId, filtered);
}

// アナウンス
export function setAnnouncement(setting) {
    const guildCache = announcementCache.get(setting.guild_id) || new Map();
    guildCache.set(setting.channel_id, setting);
    announcementCache.set(setting.guild_id, guildCache);
}
export function removeAnnouncement(guildId, channelId) {
    const guildCache = announcementCache.get(guildId) || new Map();
    guildCache.delete(channelId);
    announcementCache.set(guildId, guildCache);
}

// カレンダーモニター
export function addCalendarMonitor(setting) {
    const guildCache = monitorCache.get(setting.guild_id) || [];
    guildCache.push(setting);
    monitorCache.set(setting.guild_id, guildCache);
}
export function removeCalendarMonitor(guildId, channelId, triggerKeyword) {
     const guildCache = monitorCache.get(guildId) || [];
    const filtered = guildCache.filter(m => !(m.channel_id === channelId && m.trigger_keyword === triggerKeyword));
    monitorCache.set(guildId, filtered);
}

// サーバー設定
export function setGuildConfig(config) {
    configCache.set(config.guild_id, config);
}

// Giveaway
export function addGiveaway(giveaway) {
    const guildCache = giveawayCache.get(giveaway.guild_id) || new Map();
    guildCache.set(giveaway.message_id, giveaway);
    giveawayCache.set(giveaway.guild_id, guildCache);
}
export function updateGiveaway(guildId, messageId, updates) {
    const guildCache = giveawayCache.get(guildId);
    if (guildCache && guildCache.has(messageId)) {
        const existing = guildCache.get(messageId);
        guildCache.set(messageId, { ...existing, ...updates });
    }
}
export function removeGiveaway(guildId, messageId) {
    const guildCache = giveawayCache.get(guildId);
    if (guildCache) {
        guildCache.delete(messageId);
    }
}
export function addScheduledGiveaway(scheduled) {
    const guildCache = scheduledGiveawayCache.get(scheduled.guild_id) || [];
    guildCache.push(scheduled);
    scheduledGiveawayCache.set(scheduled.guild_id, guildCache);
}
export function removeScheduledGiveaway(guildId, id) {
    const guildCache = scheduledGiveawayCache.get(guildId) || [];
    const filtered = guildCache.filter(s => s.id !== id);
    scheduledGiveawayCache.set(guildId, filtered);
}