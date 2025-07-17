import { initializeDatabase } from './database.js';
const pool = initializeDatabase();

// --- Reactions ---
export const getReactionSettingsCount = async (guildId) => {
    const res = await pool.query('SELECT COUNT(*) as count FROM reactions WHERE guild_id = $1', [guildId]);
    return parseInt(res.rows[0].count, 10);
};

export const findReactionSetting = async (guildId, channelId, trigger) => {
    const res = await pool.query('SELECT * FROM reactions WHERE guild_id = $1 AND channel_id = $2 AND trigger = $3', [guildId, channelId, trigger]);
    return res.rows[0];
};

export const addReactionSetting = async (guildId, channelId, emojis, trigger) => {
    const sql = 'INSERT INTO reactions (guild_id, channel_id, emojis, trigger) VALUES ($1, $2, $3, $4)';
    await pool.query(sql, [guildId, channelId, emojis, trigger]);
};

export const removeReactionSetting = async (guildId, channelId, trigger) => {
    const res = await pool.query('DELETE FROM reactions WHERE guild_id = $1 AND channel_id = $2 AND trigger = $3', [guildId, channelId, trigger]);
    return res.rowCount;
};

export const listReactionSettings = async (guildId) => {
    const res = await pool.query('SELECT * FROM reactions WHERE guild_id = $1', [guildId]);
    return res.rows;
};


// --- Announcements ---
export const getAnnouncement = async (guildId, channelId) => {
    const res = await pool.query('SELECT message FROM announcements WHERE guild_id = $1 AND channel_id = $2', [guildId, channelId]);
    return res.rows[0];
};

export const saveAnnouncement = async (guildId, channelId, message) => {
    const sql = `
        INSERT INTO announcements (guild_id, channel_id, message) VALUES ($1, $2, $3)
        ON CONFLICT (guild_id, channel_id) DO UPDATE SET message = excluded.message
    `;
    await pool.query(sql, [guildId, channelId, message]);
};

export const deleteAnnouncement = async (guildId, channelId) => {
    const res = await pool.query('DELETE FROM announcements WHERE guild_id = $1 AND channel_id = $2', [guildId, channelId]);
    return res.rowCount;
};