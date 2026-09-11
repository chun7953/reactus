import crypto from 'node:crypto';
import { getDBPool } from './settingsCache.js';

const LOGIN_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 30;
const SESSION_CACHE_TTL_MS = 30 * 1000;
const sessionCache = new Map();
const guildRevocationStates = new Map();
let authRevocationRevision = 0;

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function scopedGuildId(guildId) {
    return String(guildId || '').trim();
}

function guildRevocationState(guildId) {
    const id = scopedGuildId(guildId);
    if (!id) return { active: 0, revision: 0 };
    return guildRevocationStates.get(id) || { active: 0, revision: 0 };
}

function guildAuthRevision(guildId) {
    return guildRevocationState(guildId).revision;
}

function isGuildAuthRevoking(guildId) {
    return guildRevocationState(guildId).active > 0;
}

function beginGuildAuthRevocation(guildId) {
    const id = scopedGuildId(guildId);
    const current = guildRevocationState(id);
    guildRevocationStates.set(id, {
        active: current.active + 1,
        revision: current.revision + 1,
    });
    authRevocationRevision += 1;
}

function endGuildAuthRevocation(guildId) {
    const id = scopedGuildId(guildId);
    const current = guildRevocationState(id);
    guildRevocationStates.set(id, {
        active: Math.max(0, current.active - 1),
        revision: current.revision + 1,
    });
    authRevocationRevision += 1;
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
    if (isGuildAuthRevoking(session.guild_id)) return;
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
    if (isGuildAuthRevoking(cached.session?.guild_id)) return null;
    return cached.session;
}

function clearGuildSessionCache(guildId) {
    const id = scopedGuildId(guildId);
    if (!id) return 0;
    let cleared = 0;
    for (const [sessionHash, cached] of sessionCache.entries()) {
        if (String(cached?.session?.guild_id || '') !== id) continue;
        sessionCache.delete(sessionHash);
        cleared += 1;
    }
    return cleared;
}

async function selectWebAdminSession(db, sessionHash) {
    const result = await db.query(
        `SELECT guild_id, user_id, expires_at
           FROM web_admin_sessions
          WHERE session_hash = $1 AND expires_at > NOW()`,
        [sessionHash],
    );
    return result.rows[0] || null;
}

export async function issueWebAdminLogin(guildId, userId, { db: suppliedDb } = {}) {
    const id = scopedGuildId(guildId);
    if (!id || !userId) throw new Error('guildId and userId are required');
    if (isGuildAuthRevoking(id)) throw new Error('Web admin auth is being revoked for this guild');

    const observedRevision = guildAuthRevision(id);
    const token = randomToken();
    const tokenHash = hashToken(token);
    const db = suppliedDb || await getDBPool();
    await db.query(
        `INSERT INTO web_admin_login_tokens (token_hash, guild_id, user_id, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)`,
        [tokenHash, id, userId, String(LOGIN_TTL_MINUTES)],
    );

    // A guild departure can overlap the INSERT and miss the not-yet-committed
    // token. If that boundary moved, remove the new credential before it can be
    // returned to the caller.
    if (observedRevision !== guildAuthRevision(id) || isGuildAuthRevoking(id)) {
        await db.query('DELETE FROM web_admin_login_tokens WHERE token_hash = $1', [tokenHash]);
        throw new Error('Web admin auth was revoked while issuing a login link');
    }

    await db.query('DELETE FROM web_admin_login_tokens WHERE expires_at < NOW()');
    await db.query('DELETE FROM web_admin_sessions WHERE expires_at < NOW()');
    return token;
}

export async function consumeWebAdminLogin(token, { db: suppliedDb } = {}) {
    if (!token) return null;
    const pool = suppliedDb || await getDBPool();
    const client = await pool.connect();
    let transactionOpen = false;
    let sessionHash = null;
    let guildId = null;
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

        const { guild_id: rawGuildId, user_id: userId } = login.rows[0];
        guildId = scopedGuildId(rawGuildId);
        const observedRevision = guildAuthRevision(guildId);

        // Keep the one-time token consumed, but do not mint a session while a
        // guild-wide credential revocation is already active.
        if (isGuildAuthRevoking(guildId)) {
            await client.query('COMMIT');
            transactionOpen = false;
            return null;
        }

        const sessionToken = randomToken();
        sessionHash = hashToken(sessionToken);
        await client.query(
            `INSERT INTO web_admin_sessions (session_hash, guild_id, user_id, expires_at)
             VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)`,
            [sessionHash, guildId, userId, String(SESSION_TTL_DAYS)],
        );
        await client.query('COMMIT');
        transactionOpen = false;

        // A single guild-delete statement can observe the consumed login token
        // yet miss a session inserted later in this transaction. Detect that
        // crossed boundary after commit and remove the newly-created session.
        if (observedRevision !== guildAuthRevision(guildId) || isGuildAuthRevoking(guildId)) {
            await pool.query('DELETE FROM web_admin_sessions WHERE session_hash = $1', [sessionHash]);
            sessionCache.delete(sessionHash);
            return null;
        }

        rememberSession(sessionHash, {
            guild_id: guildId,
            user_id: userId,
            expires_at: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        });
        return { sessionToken, guildId, userId, maxAgeSeconds: SESSION_TTL_DAYS * 24 * 60 * 60 };
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
        if (sessionHash) sessionCache.delete(sessionHash);
        throw error;
    } finally {
        client.release();
    }
}

export async function getWebAdminSession(sessionToken, { db: suppliedDb } = {}) {
    if (!sessionToken) return null;
    const sessionHash = hashToken(sessionToken);
    const cached = readCachedSession(sessionHash);
    if (cached) return cached;

    const db = suppliedDb || await getDBPool();
    let observedRevision = authRevocationRevision;
    let session = await selectWebAdminSession(db, sessionHash);

    // A guild-wide revocation can overlap this SELECT. If any revocation
    // boundary moved while the query was in flight, never cache or return that
    // snapshot. Re-read once from the post-revocation database state. If the
    // boundary moves again during the retry, fail closed.
    if (observedRevision !== authRevocationRevision) {
        observedRevision = authRevocationRevision;
        session = await selectWebAdminSession(db, sessionHash);
        if (observedRevision !== authRevocationRevision) return null;
    }

    if (session && isGuildAuthRevoking(session.guild_id)) return null;
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
    const id = scopedGuildId(guildId);
    if (!id) throw new Error('guildId is required');

    beginGuildAuthRevocation(id);
    clearGuildSessionCache(id);
    const db = suppliedDb || await getDBPool();

    try {
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
            [id],
        );

        return {
            loginTokens: Number(result.rows?.[0]?.login_tokens || 0),
            sessions: Number(result.rows?.[0]?.sessions || 0),
        };
    } finally {
        clearGuildSessionCache(id);
        endGuildAuthRevocation(id);
    }
}
