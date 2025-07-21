import { initializeDatabase } from '../db/database.js';

// 各設定をギルドIDごとに保持するMap
const reactionCache = new Map();
const announcementCache = new Map();
const monitorCache = new Map();
const configCache = new Map();
// ★★★ Giveaway用のキャッシュを追加 ★★★
const giveawayCache = new Map();
const scheduledGiveawayCache = new Map();

/**
 * ボット起動時に全てのサーバーの設定をDBから読み込み、メモリにキャッシュする
 */
export async function initializeCache() {
    console.log('[Cache] 全設定のキャッシュを開始します...');
    const pool = await initializeDatabase();
    
    // リアクション
    const reactions = (await pool.query('SELECT * FROM reactions')).rows;
    reactionCache.clear();
    for (const r of reactions) {
        if (!reactionCache.has(r.guild_id)) reactionCache.set(r.guild_id, []);
        reactionCache.get(r.guild_id).push(r);
    }

    // アナウンス
    const announcements = (await pool.query('SELECT * FROM announcements')).rows;
    announcementCache.clear();
    for (const a of announcements) {
        if (!announcementCache.has(a.guild_id)) announcementCache.set(a.guild_id, []);
        announcementCache.get(a.guild_id).push(a);
    }
    
    // カレンダーモニター
    const monitors = (await pool.query('SELECT * FROM calendar_monitors')).rows;
    monitorCache.clear();
    for (const m of monitors) {
        if (!monitorCache.has(m.guild_id)) monitorCache.set(m.guild_id, []);
        monitorCache.get(m.guild_id).push(m);
    }

    // メインカレンダー設定
    const configs = (await pool.query('SELECT * FROM guild_configs')).rows;
    configCache.clear();
    for (const c of configs) {
        configCache.set(c.guild_id, c);
    }

    // ★★★ ここからがGiveaway用のキャッシュ処理です ★★★
    // 進行中のGiveaway
    const giveaways = (await pool.query("SELECT * FROM giveaways WHERE status = 'RUNNING'")).rows;
    giveawayCache.clear();
    for (const g of giveaways) {
        if (!giveawayCache.has(g.guild_id)) giveawayCache.set(g.guild_id, []);
        giveawayCache.get(g.guild_id).push(g);
    }
    
    // 予約・定期Giveaway
    const scheduledGiveaways = (await pool.query('SELECT * FROM scheduled_giveaways')).rows;
    scheduledGiveawayCache.clear();
    for (const sg of scheduledGiveaways) {
        if (!scheduledGiveawayCache.has(sg.guild_id)) scheduledGiveawayCache.set(sg.guild_id, []);
        scheduledGiveawayCache.get(sg.guild_id).push(sg);
    }
    // ★★★ ここまでが追記部分です ★★★
    
    console.log(`[Cache] キャッシュ完了 (リアクション: ${reactions.length}件, アナウンス: ${announcements.length}件, モニター: ${monitors.length}件, サーバー設定: ${configs.length}件, 進行中Giveaway: ${giveaways.length}件, 予約Giveaway: ${scheduledGiveaways.length}件)`);
}

// --- 既存のゲッター関数 (変更なし) ---
export function getReactionSettings(guildId) { return reactionCache.get(guildId) || []; }
export function getAnnouncement(guildId, channelId) { const a = announcementCache.get(guildId) || []; return a.find(x => x.channel_id === channelId); }
export function getMonitorsByGuild(guildId) { return monitorCache.get(guildId) || []; }
export function getMonitors() { return Array.from(monitorCache.values()).flat(); }
export function getMainCalendar(guildId) { return configCache.get(guildId); }

// ★★★ ここからがGiveaway用のゲッター関数です ★★★
/**
 * ギルドの進行中Giveawayをキャッシュから取得
 */
export function getActiveGiveaways(guildId) {
    return giveawayCache.get(guildId) || [];
}
/**
 * 全ての進行中Giveawayをキャッシュから取得
 */
export function getAllActiveGiveaways() {
    return Array.from(giveawayCache.values()).flat();
}
/**
 * ギルドの予約・定期Giveawayをキャッシュから取得
 */
export function getScheduledGiveaways(guildId) {
    return scheduledGiveawayCache.get(guildId) || [];
}
/**
 * 全ての予約・定期Giveawayをキャッシュから取得
 */
export function getAllScheduledGiveaways() {
    return Array.from(scheduledGiveawayCache.values()).flat();
}
// ★★★ ここまでが追記部分です ★★★

// データベースへの書き込みと同時にキャッシュも更新する
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