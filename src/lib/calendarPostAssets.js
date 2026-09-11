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
        `SELECT id, filename, content_type, size_bytes, data, calendar_id, event_id, last_verified_at
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
                    last_verified_at = CURRENT_TIMESTAMP
              WHERE id = $1 AND guild_id = $2`,
            [assetId, scopedGuildId, scopedCalendarId, scopedEventId],
        );
        return result.rowCount > 0;
    } catch (error) {
        console.error(`[CalendarPostAssets] 画像 ${assetId} の予定所有情報を保存できませんでした:`, error);
        return false;
    }
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
