import { randomUUID } from 'node:crypto';
import { getDBPool } from './settingsCache.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function insertCalendarPostImage(guildId, { filename, contentType, data }) {
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
            guildId,
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

export async function getCalendarPostImage(assetId) {
    if (!assetId) return null;
    const pool = await getDBPool();
    const result = await pool.query(
        `SELECT id, filename, content_type, size_bytes, data
           FROM calendar_post_assets
          WHERE id = $1`,
        [assetId],
    );
    return result.rows[0] || null;
}

export async function deleteCalendarPostImage(assetId) {
    if (!assetId) return false;
    const pool = await getDBPool();
    const result = await pool.query('DELETE FROM calendar_post_assets WHERE id = $1', [assetId]);
    return result.rowCount > 0;
}
