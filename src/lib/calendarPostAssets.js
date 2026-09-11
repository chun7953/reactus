import { randomUUID } from 'node:crypto';
import { getDBPool } from './settingsCache.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function requireGuildId(guildId) {
    const value = String(guildId || '').trim();
    if (!value) throw new Error('画像を操作するDiscordサーバーを特定できません。');
    return value;
}

function requireOwnerIdentifier(value, label) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`${label}を特定できません。`);
    return normalized;
}

function checkedAtValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('画像参照確認時刻が正しくありません。');
    return date;
}

function boundedLimit(value, fallback = 20) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, 100);
}

async function insertCalendarPostImage(guildId, { filename, contentType, data }) {
    const scopedGuildId = requireGuildId(guildId);
    if (!contentType?.startsWith('image/')) {
        throw new Error('画像ファイルを指定してください。');
    }
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error('画像は8MB以下にしてください。');
    }

    const id = randomUUID();
    const pool = await getDBPool();
    await pool.query(
        `INSERT INTO calendar_post_assets
            (id, guild_id, filename, content_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            id,
            scopedGuildId,
            filename || 'image',
            contentType,
            buffer.byteLength,
            buffer,
        ],
    );
    return id;
}

export async function storeCalendarPostImage(guildId, attachment) {
    if (!attachment) return null;
    if (!attachment.contentType?.startsWith('image/')) {
        throw new Error('画像ファイルを指定してください。');
    }
    if (attachment.size > MAX_IMAGE_BYTES) {
        throw new Error('画像は8MB以下にしてください。');
    }

    const response = await fetch(attachment.url);
    if (!response.ok) {
        throw new Error(`画像の取得に失敗しました (${response.status})。`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return insertCalendarPostImage(guildId, {
        filename: attachment.name || 'image',
        contentType: attachment.contentType,
        data: Buffer.from(arrayBuffer),
    });
}

export async function storeCalendarPostImageBuffer(guildId, { filename, contentType, data }) {
    if (!data) return null;
    return insertCalendarPostImage(guildId, { filename, contentType, data });
}

export async function getCalendarPostImage(assetId, guildId) {
    if (!assetId) return null;
    const scopedGuildId = requireGuildId(guildId);
    const pool = await getDBPool();
    const result = await pool.query(
        `SELECT id, filename, content_type, size_bytes, data, calendar_id, event_id,
                last_verified_at, last_checked_at, missing_since
           FROM calendar_post_assets
          WHERE id = $1 AND guild_id = $2`,
        [assetId, scopedGuildId],
    );
    return result.rows[0] || null;
}

export async function cloneCalendarPostImage(guildId, assetId) {
    const scopedGuildId = requireGuildId(guildId);
    const source = await getCalendarPostImage(assetId, scopedGuildId);
    if (!source) return null;
    return insertCalendarPostImage(scopedGuildId, {
        filename: source.filename,
        contentType: source.content_type,
        data: source.data,
    });
}

export async function bindCalendarPostImageOwner(assetId, guildId, { calendarId, eventId }) {
    if (!assetId) return false;
    try {
        const scopedGuildId = requireGuildId(guildId);
        const scopedCalendarId = requireOwnerIdentifier(calendarId, '画像を所有するカレンダー');
        const scopedEventId = requireOwnerIdentifier(eventId, '画像を所有する予定');
        const pool = await getDBPool();
        const result = await pool.query(
            `UPDATE calendar_post_assets
                SET calendar_id = $3,
                    event_id = $4,
                    last_verified_at = CURRENT_TIMESTAMP,
                    last_checked_at = CURRENT_TIMESTAMP,
                    missing_since = NULL
              WHERE id = $1 AND guild_id = $2`,
            [assetId, scopedGuildId, scopedCalendarId, scopedEventId],
        );
        return result.rowCount > 0;
    } catch (error) {
        console.error(`[CalendarPostAssets] 画像 ${assetId} の予定所有情報を保存できませんでした:`, error);
        return false;
    }
}

export async function listCalendarPostImageReconciliationCandidates(guildIds, {
    before,
    limit = 20,
} = {}) {
    const scopedGuildIds = [...new Set((guildIds || []).map(value => String(value || '').trim()).filter(Boolean))];
    if (scopedGuildIds.length === 0) return [];
    const cutoff = checkedAtValue(before);
    const pool = await getDBPool();
    const result = await pool.query(
        `SELECT id, guild_id, calendar_id, event_id, created_at,
                last_verified_at, last_checked_at, missing_since
           FROM calendar_post_assets
          WHERE guild_id = ANY($1::TEXT[])
            AND calendar_id IS NOT NULL
            AND event_id IS NOT NULL
            AND COALESCE(last_checked_at, last_verified_at, created_at) <= $2
          ORDER BY COALESCE(last_checked_at, last_verified_at, created_at) ASC, created_at ASC, id ASC
          LIMIT $3`,
        [scopedGuildIds, cutoff, boundedLimit(limit)],
    );
    return result.rows || [];
}

export async function confirmCalendarPostImageReference(asset, {
    calendarId,
    eventId,
    checkedAt,
} = {}) {
    const pool = await getDBPool();
    const confirmedAt = checkedAtValue(checkedAt);
    const scopedCalendarId = requireOwnerIdentifier(calendarId, '確認済み画像のカレンダー');
    const scopedEventId = requireOwnerIdentifier(eventId, '確認済み画像の予定');
    const result = await pool.query(
        `UPDATE calendar_post_assets
            SET calendar_id = $8,
                event_id = $9,
                last_verified_at = $10,
                last_checked_at = $10,
                missing_since = NULL
          WHERE id = $1
            AND guild_id = $2
            AND calendar_id = $3
            AND event_id = $4
            AND last_verified_at IS NOT DISTINCT FROM $5
            AND last_checked_at IS NOT DISTINCT FROM $6
            AND missing_since IS NOT DISTINCT FROM $7`,
        [
            asset.id,
            asset.guild_id,
            asset.calendar_id,
            asset.event_id,
            asset.last_verified_at || null,
            asset.last_checked_at || null,
            asset.missing_since || null,
            scopedCalendarId,
            scopedEventId,
            confirmedAt,
        ],
    );
    return result.rowCount > 0;
}

export async function recordCalendarPostImageReconciliationAttempt(asset, { checkedAt } = {}) {
    const pool = await getDBPool();
    const attemptedAt = checkedAtValue(checkedAt);
    const result = await pool.query(
        `UPDATE calendar_post_assets
            SET last_checked_at = $8
          WHERE id = $1
            AND guild_id = $2
            AND calendar_id = $3
            AND event_id = $4
            AND last_verified_at IS NOT DISTINCT FROM $5
            AND last_checked_at IS NOT DISTINCT FROM $6
            AND missing_since IS NOT DISTINCT FROM $7`,
        [
            asset.id,
            asset.guild_id,
            asset.calendar_id,
            asset.event_id,
            asset.last_verified_at || null,
            asset.last_checked_at || null,
            asset.missing_since || null,
            attemptedAt,
        ],
    );
    return result.rowCount > 0;
}

export async function markCalendarPostImageMissing(asset, { checkedAt } = {}) {
    const pool = await getDBPool();
    const attemptedAt = checkedAtValue(checkedAt);
    const result = await pool.query(
        `UPDATE calendar_post_assets
            SET last_checked_at = $8,
                missing_since = COALESCE(missing_since, $8)
          WHERE id = $1
            AND guild_id = $2
            AND calendar_id = $3
            AND event_id = $4
            AND last_verified_at IS NOT DISTINCT FROM $5
            AND last_checked_at IS NOT DISTINCT FROM $6
            AND missing_since IS NOT DISTINCT FROM $7`,
        [
            asset.id,
            asset.guild_id,
            asset.calendar_id,
            asset.event_id,
            asset.last_verified_at || null,
            asset.last_checked_at || null,
            asset.missing_since || null,
            attemptedAt,
        ],
    );
    return result.rowCount > 0;
}

export async function deleteCalendarPostImageIfUnchanged(asset) {
    const pool = await getDBPool();
    const result = await pool.query(
        `DELETE FROM calendar_post_assets
          WHERE id = $1
            AND guild_id = $2
            AND calendar_id = $3
            AND event_id = $4
            AND last_verified_at IS NOT DISTINCT FROM $5
            AND last_checked_at IS NOT DISTINCT FROM $6
            AND missing_since IS NOT DISTINCT FROM $7`,
        [
            asset.id,
            asset.guild_id,
            asset.calendar_id,
            asset.event_id,
            asset.last_verified_at || null,
            asset.last_checked_at || null,
            asset.missing_since || null,
        ],
    );
    return result.rowCount > 0;
}

export async function deleteCalendarPostImage(assetId, guildId) {
    if (!assetId) return false;
    const scopedGuildId = requireGuildId(guildId);
    const pool = await getDBPool();
    const result = await pool.query(
        'DELETE FROM calendar_post_assets WHERE id = $1 AND guild_id = $2',
        [assetId, scopedGuildId],
    );
    return result.rowCount > 0;
}
