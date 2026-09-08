import crypto from 'node:crypto';
import { getDBPool } from './settingsCache.js';

const LOGIN_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 30;

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export async function issueWebAdminLogin(guildId, userId) {
    if (!guildId || !userId) throw new Error('guildId and userId are required');
    const token = randomToken();
    const pool = await getDBPool();
    await pool.query(
        `INSERT INTO web_admin_login_tokens (token_hash, guild_id, user_id, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
        [hashToken(token), guildId, userId, String(LOGIN_TTL_MINUTES)],
    );
    await pool.query('DELETE FROM web_admin_login_tokens WHERE expires_at < NOW()');
    await pool.query('DELETE FROM web_admin_sessions WHERE expires_at < NOW()');
    return token;
}

export async function consumeWebAdminLogin(token) {
    if (!token) return null;
    const pool = await getDBPool();
    const client = await pool.connect();
    let transactionOpen = false;
    try {
        await client.query('BEGIN');
        transactionOpen = true;
        const login = await client.query(
            `DELETE FROM web_admin_login_tokens
              WHERE token_hash = $1 AND expires_at > NOW()
              RETURNING guild_id, user_id`,
            [hashToken(token)],
        );
        if (!login.rows[0]) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return null;
        }

        const sessionToken = randomToken();
        const { guild_id: guildId, user_id: userId } = login.rows[0];
        await client.query(
            `INSERT INTO web_admin_sessions (session_hash, guild_id, user_id, expires_at)
             VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)`,
            [hashToken(sessionToken), guildId, userId, String(SESSION_TTL_DAYS)],
        );
        await client.query('COMMIT');
        transactionOpen = false;
        return { sessionToken, guildId, userId, maxAgeSeconds: SESSION_TTL_DAYS * 24 * 60 * 60 };
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

export async function getWebAdminSession(sessionToken) {
    if (!sessionToken) return null;
    const pool = await getDBPool();
    const result = await pool.query(
        `SELECT guild_id, user_id, expires_at
           FROM web_admin_sessions
          WHERE session_hash = $1 AND expires_at > NOW()`,
        [hashToken(sessionToken)],
    );
    return result.rows[0] || null;
}

export async function revokeWebAdminSession(sessionToken) {
    if (!sessionToken) return false;
    const pool = await getDBPool();
    const result = await pool.query('DELETE FROM web_admin_sessions WHERE session_hash = $1', [hashToken(sessionToken)]);
    return result.rowCount > 0;
}
