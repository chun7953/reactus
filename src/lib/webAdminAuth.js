import crypto from 'node:crypto';
import { getDBPool } from './settingsCache.js';

const LOGIN_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 30;
const SESSION_CACHE_TTL_MS = 30 * 1000;
const sessionCache = new Map();

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function sessionExpiryMs(session) {
    const value = session?.expires_at instanceof Date
        ? session.expires_at.getTime()
        : new Date(session?.expires_at || 0).getTime();
    return Number.isFinite(value) ? value : 0;
}

function rememberSession(sessionHash, session) {
    const now = Date.now();
    const expiresAt = sessionExpiryMs(session);
    if (!sessionHash || !session || expiresAt <= now) return;
    sessionCache.set(sessionHash, {
        session,
        cacheUntil: Math.min(now + SESSION_CACHE_TTL_MS, expiresAt),
    });
}

function readCachedSession(sessionHash) {
    const cached = sessionCache.get(sessionHash);
    if (!cached) return null;
    if (cached.cacheUntil <= Date.now() || sessionExpiryMs(cached.session) <= Date.now()) {
        sessionCache.delete(sessionHash);
        return null;
    }
    return cached.session;
}

function clearGuildSessionCache(guildId) {
    const scopedGuildId = String(guildId || '').trim();
    if (!scopedGuildId) return 0;
    let cleared = 0;
    for (const [sessionHash, cached] of sessionCache.entries()) {
        if (String(cached?.session?.guild_id || '') !== scopedGuildId) continue;
        sessionCache.delete(sessionHash);
        cleared += 1;
    }
    return cleared;
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
        const sessionHash = hashToken(sessionToken);
        const { guild_id: guildId, user_id: userId } = login.rows[0];
        await client.query(
            `INSERT INTO web_admin_sessions (session_hash, guild_id, user_id, expires_at)
             VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)`,
            [sessionHash, guildId, userId, String(SESSION_TTL_DAYS)],
        );
        await client.query('COMMIT');
        transactionOpen = false;
        rememberSession(sessionHash, {
            guild_id: guildId,
            user_id: userId,
            expires_at: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        });
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
    const sessionHash = hashToken(sessionToken);
    const cached = readCachedSession(sessionHash);
    if (cached) return cached;

    const pool = await getDBPool();
    const result = await pool.query(
        `SELECT guild_id, user_id, expires_at
           FROM web_admin_sessions
          WHERE session_hash = $1 AND expires_at > NOW()`,
        [sessionHash],
    );
    const session = result.rows[0] || null;
    if (session) rememberSession(sessionHash, session);
    return session;
}

export async function revokeWebAdminSession(sessionToken) {
    if (!sessionToken) return false;
    const sessionHash = hashToken(sessionToken);
    sessionCache.delete(sessionHash);
    const pool = await getDBPool();
    const result = await pool.query('DELETE FROM web_admin_sessions WHERE session_hash = $1', [sessionHash]);
    return result.rowCount > 0;
}

export async function revokeWebAdminAuthForGuild(guildId, { db: suppliedDb } = {}) {
    const scopedGuildId = String(guildId || '').trim();
    if (!scopedGuildId) throw new Error('guildId is required');

    // Cached sessions are credentials too. Drop them before and after the DB
    // revocation so requests overlapping this operation cannot keep a stale
    // cached credential alive after the guild leaves.
    clearGuildSessionCache(scopedGuildId);
    const db = suppliedDb || await getDBPool();
    const result = await db.query(
        `WITH deleted_login_tokens AS (
            DELETE FROM web_admin_login_tokens
             WHERE guild_id = $1
             RETURNING 1
         ),
         deleted_sessions AS (
            DELETE FROM web_admin_sessions
             WHERE guild_id = $1
             RETURNING 1
         )
         SELECT
            (SELECT COUNT(*)::INTEGER FROM deleted_login_tokens) AS login_tokens,
            (SELECT COUNT(*)::INTEGER FROM deleted_sessions) AS sessions`,
        [scopedGuildId],
    );
    clearGuildSessionCache(scopedGuildId);

    return {
        loginTokens: Number(result.rows?.[0]?.login_tokens || 0),
        sessions: Number(result.rows?.[0]?.sessions || 0),
    };
}
