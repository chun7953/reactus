import { randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { getDBPool } from './settingsCache.js';

const CHALLENGE_TTL_MS = 15 * 60 * 1000;
const CHALLENGE_PREFIX = 'REACTUS-VERIFY-';

function normalizeCalendarId(value) {
    const calendarId = String(value || '').trim();
    if (!calendarId) throw new Error('GoogleカレンダーIDを入力してください。');
    if (calendarId.length > 512) throw new Error('GoogleカレンダーIDが長すぎます。');
    return calendarId;
}

function challengeCode(token) {
    return `${CHALLENGE_PREFIX}${token}`;
}

function newChallengeToken() {
    return randomBytes(18).toString('base64url');
}

function challengeMessage(calendarId, token) {
    return [
        `カレンダー ${calendarId} は、このDiscordサーバーでまだ所有確認されていません。`,
        'Googleカレンダーの設定で、対象カレンダーの「説明」欄に次の確認コードをそのまま追加して保存してください。',
        `\`${challengeCode(token)}\``,
        '保存後15分以内に、同じ操作をもう一度実行してください。確認完了後は説明欄からコードを削除して構いません。',
    ].join('\n');
}

function requiredMessage(calendarId) {
    return `カレンダー ${calendarId} は、このDiscordサーバーで所有確認されていません。サーバー管理者が \`/verify-calendar\` またはメインカレンダー設定から所有確認を完了してください。`;
}

function accessMessage(calendarId, email) {
    const account = email ? ` サービスアカウント: ${email}` : '';
    return `カレンダー ${calendarId} にアクセスできません。Googleカレンダーの共有設定でReactusのサービスアカウントを追加してください。予定の作成・編集には「予定の変更」権限が必要です。${account}`;
}

export class CalendarClaimChallengeError extends Error {
    constructor(calendarId, token) {
        super(challengeMessage(calendarId, token));
        this.name = 'CalendarClaimChallengeError';
        this.statusCode = 409;
        this.calendarId = calendarId;
        this.challengeCode = challengeCode(token);
    }
}

export class CalendarClaimRequiredError extends Error {
    constructor(calendarId) {
        super(requiredMessage(calendarId));
        this.name = 'CalendarClaimRequiredError';
        this.statusCode = 403;
        this.calendarId = calendarId;
    }
}

async function calendarMetadata(calendarId, { calendar: suppliedCalendar, serviceAccountEmail } = {}) {
    let calendar = suppliedCalendar;
    let email = serviceAccountEmail;
    if (!calendar) {
        const { auth } = await initializeSheetsAPI();
        calendar = google.calendar({ version: 'v3', auth });
        email = email || auth?.email;
    }

    try {
        const response = await calendar.calendars.get({ calendarId });
        return { metadata: response.data || {}, serviceAccountEmail: email || null };
    } catch (error) {
        if (error?.code === 403 || error?.code === 404) {
            const accessError = new Error(accessMessage(calendarId, email));
            accessError.statusCode = 403;
            throw accessError;
        }
        throw error;
    }
}

export async function ensureCalendarClaim(guildId, rawCalendarId, {
    allowChallenge = false,
    db: suppliedDb,
    calendar,
    serviceAccountEmail,
    now = () => new Date(),
    tokenFactory = newChallengeToken,
} = {}) {
    const calendarId = normalizeCalendarId(rawCalendarId);
    const db = suppliedDb || await getDBPool();
    let result = await db.query(
        `SELECT guild_id, calendar_id, verified_at, verification_method, challenge_token, challenge_expires_at
         FROM calendar_claims
         WHERE guild_id = $1 AND calendar_id = $2`,
        [guildId, calendarId],
    );
    let claim = result.rows?.[0] || null;
    if (claim?.verified_at) {
        return { calendarId, verified: true, newlyVerified: false, method: claim.verification_method || null };
    }

    if (!allowChallenge) throw new CalendarClaimRequiredError(calendarId);

    const currentTime = now();
    const currentMs = currentTime.getTime();
    const metadataResult = await calendarMetadata(calendarId, { calendar, serviceAccountEmail });
    const description = String(metadataResult.metadata.description || '');
    const challengeExpiresAt = claim?.challenge_expires_at ? new Date(claim.challenge_expires_at) : null;
    const activeChallenge = Boolean(
        claim?.challenge_token
        && challengeExpiresAt
        && Number.isFinite(challengeExpiresAt.getTime())
        && challengeExpiresAt.getTime() > currentMs
    );

    if (activeChallenge && description.includes(challengeCode(claim.challenge_token))) {
        result = await db.query(
            `UPDATE calendar_claims
             SET verified_at = $3,
                 verification_method = 'calendar_description',
                 challenge_token = NULL,
                 challenge_expires_at = NULL
             WHERE guild_id = $1 AND calendar_id = $2 AND challenge_token = $4
             RETURNING verified_at`,
            [guildId, calendarId, currentTime, claim.challenge_token],
        );
        if (result.rowCount > 0) {
            return { calendarId, verified: true, newlyVerified: true, method: 'calendar_description' };
        }
        claim = (await db.query(
            `SELECT verified_at, verification_method, challenge_token, challenge_expires_at
             FROM calendar_claims
             WHERE guild_id = $1 AND calendar_id = $2`,
            [guildId, calendarId],
        )).rows?.[0] || null;
        if (claim?.verified_at) {
            return { calendarId, verified: true, newlyVerified: false, method: claim.verification_method || null };
        }
    }

    if (activeChallenge) throw new CalendarClaimChallengeError(calendarId, claim.challenge_token);

    const token = tokenFactory();
    const expiresAt = new Date(currentMs + CHALLENGE_TTL_MS);
    await db.query(
        `INSERT INTO calendar_claims
            (guild_id, calendar_id, verified_at, verification_method, challenge_token, challenge_expires_at)
         VALUES ($1, $2, NULL, NULL, $3, $4)
         ON CONFLICT (guild_id, calendar_id)
         DO UPDATE SET
            verified_at = NULL,
            verification_method = NULL,
            challenge_token = EXCLUDED.challenge_token,
            challenge_expires_at = EXCLUDED.challenge_expires_at`,
        [guildId, calendarId, token, expiresAt],
    );
    throw new CalendarClaimChallengeError(calendarId, token);
}

export async function unverifiedCalendarIds(db, guildId, calendarIds) {
    const ids = [...new Set((calendarIds || []).map(value => String(value || '').trim()).filter(Boolean))];
    if (ids.length === 0) return [];
    const result = await db.query(
        `SELECT calendar_id
         FROM calendar_claims
         WHERE guild_id = $1
           AND verified_at IS NOT NULL
           AND calendar_id = ANY($2::TEXT[])`,
        [guildId, ids],
    );
    const verified = new Set((result.rows || []).map(row => String(row.calendar_id)));
    return ids.filter(id => !verified.has(id));
}

export async function revokeCalendarClaimsForGuild(guildId, { db: suppliedDb } = {}) {
    const db = suppliedDb || await getDBPool();
    const result = await db.query(
        'DELETE FROM calendar_claims WHERE guild_id = $1',
        [guildId],
    );
    return Number(result.rowCount || 0);
}

export { CHALLENGE_PREFIX, CHALLENGE_TTL_MS, normalizeCalendarId as normalizeClaimCalendarId };
