import { initializeDatabase } from '../db/database.js';

const reactionCache = new Map();
const announcementCache = new Map();
const monitorCache = new Map();
const configCache = new Map();
const giveawayCache = new Map();
const scheduledGiveawayCache = new Map();

export async function initializeCache() {
    console.log('[Cache] 全設定のキャッシュを開始します...');
    const pool = await initializeDatabase();
    
    reactionCache.clear();
    const reactions = (await pool.query('SELECT * FROM reactions')).rows;
    for (const r of reactions) {
        if (!reactionCache.has(r.guild_id)) reactionCache.set(r.guild_id, []);
        reactionCache.get(r.guild_id).push(r);
    }

    announcementCache.clear();
    const announcements = (await pool.query('SELECT * FROM announcements')).rows;
    for (const a of announcements) {
        if (!announcementCache.has(a.guild_id)) announcementCache.set(a.guild_id, []);
        announcementCache.get(a.guild_id).push(a);
    }
    
    monitorCache.clear();
    const monitors = (await pool.query('SELECT * FROM calendar_monitors')).rows;
    for (const m of monitors) {
        if (!monitorCache.has(m.guild_id)) monitorCache.set(m.guild_id, []);
        monitorCache.get(m.guild_id).push(m);
    }

    configCache.clear();
    const configs = (await pool.query('SELECT * FROM guild_configs')).rows;
    for (const c of configs) {
        configCache.set(c.guild_id, c);
    }

    giveawayCache.clear();
    const giveaways = (await pool.query("SELECT * FROM giveaways WHERE status = 'RUNNING'")).rows;
    for (const g of giveaways) {
        if (!giveawayCache.has(g.guild_id)) giveawayCache.set(g.guild_id, []);
        giveawayCache.get(g.guild_id).push(g);
    }
    
    scheduledGiveawayCache.clear();
    const scheduledGiveaways = (await pool.query('SELECT * FROM scheduled_giveaways')).rows;
    for (const sg of scheduledGiveaways) {
        if (!scheduledGiveawayCache.has(sg.guild_id)) scheduledGiveawayCache.set(sg.guild_id, []);
        scheduledGiveawayCache.get(sg.guild_id).push(sg);
    }
    
    console.log(`[Cache] キャッシュ完了 (リアクション: ${reactions.length}件, アナウンス: ${announcements.length}件, モニター: ${monitors.length}件, サーバー設定: ${configs.length}件, 進行中Giveaway: ${giveaways.length}件, 予約Giveaway: ${scheduledGiveaways.length}件)`);
}

export function getReactionSettings(guildId) { return reactionCache.get(guildId) || []; }
export function getAnnouncement(guildId, channelId) { const a = announcementCache.get(guildId) || []; return a.find(x => x.channel_id === channelId); }
export function getMonitorsByGuild(guildId) { return monitorCache.get(guildId) || []; }
export function getMonitors() { return Array.from(monitorCache.values()).flat(); }
export function getMainCalendar(guildId) { return configCache.get(guildId); }
export function getGuildConfig(guildId) { return configCache.get(guildId); } // ★ 権限取得のために追加
export function getActiveGiveaways(guildId) { return giveawayCache.get(guildId) || []; }
export function getAllActiveGiveaways() { return Array.from(giveawayCache.values()).flat(); }
export function getScheduledGiveaways(guildId) { return scheduledGiveawayCache.get(guildId) || []; }
export function getAllScheduledGiveaways() { return Array.from(scheduledGiveawayCache.values()).flat(); }

export const cacheDB = {
    async query(sql, params) {
        const pool = await initializeDatabase();
        const result = await pool.query(sql, params);
        if (result.rowCount > 0 && !sql.trim().toUpperCase().startsWith('SELECT')) {
            console.log('[Cache] データ変更を検知したため、キャッシュを更新します。');
            await initializeCache(); 
        }
        return result;
    }
};