import { initializeDatabase } from '../db/database.js';

// 各設定をギルドIDごとに保持するMap
const reactionCache = new Map();
const announcementCache = new Map();
const monitorCache = new Map();
const configCache = new Map();

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
    
    console.log(`[Cache] キャッシュ完了 (リアクション: ${reactions.length}件, アナウンス: ${announcements.length}件, モニター: ${monitors.length}件, サーバー設定: ${configs.length}件)`);
}

/**
 * ギルドのリアクション設定をキャッシュから取得
 */
export function getReactionSettings(guildId) {
    return reactionCache.get(guildId) || [];
}

/**
 * チャンネルのアナウンス設定をキャッシュから取得
 */
export function getAnnouncement(guildId, channelId) {
    const guildAnnouncements = announcementCache.get(guildId) || [];
    return guildAnnouncements.find(a => a.channel_id === channelId);
}

/**
 * ギルドのカレンダーモニター設定をキャッシュから取得
 */
export function getMonitorsByGuild(guildId) {
    return monitorCache.get(guildId) || [];
}

/**
 * 全てのカレンダーモニター設定をキャッシュから取得
 */
export function getMonitors() {
    return Array.from(monitorCache.values()).flat();
}

/**
 * ギルドのメインカレンダー設定をキャッシュから取得
 */
export function getMainCalendar(guildId) {
    return configCache.get(guildId);
}

// データベースへの書き込みと同時にキャッシュも更新する
export const cacheDB = {
    async query(sql, params) {
        const pool = await initializeDatabase();
        const result = await pool.query(sql, params);
        
        // データ変更があった場合はキャッシュを再読み込みする
        if (result.rowCount > 0 && !sql.trim().toUpperCase().startsWith('SELECT')) {
            console.log('[Cache] データ変更を検知したため、キャッシュを更新します。');
            await initializeCache(); 
        }
        return result;
    }
};