import { MessageFlags } from 'discord.js';
import { getDBPool, invalidateAnnouncement } from './settingsCache.js';

export const MAX_ANNOUNCEMENT_LENGTH = 2000;

function createUserError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

export function normalizeAnnouncementText(value) {
    const text = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!text.trim()) throw createUserError('案内文を入力してください。');
    if (text.length > MAX_ANNOUNCEMENT_LENGTH) {
        throw createUserError(`案内文は${MAX_ANNOUNCEMENT_LENGTH}文字以内にしてください。`);
    }
    return text;
}

async function resolveAnnouncementChannel(guild, channelId) {
    const id = String(channelId || '').trim();
    if (!/^\d{15,22}$/.test(id)) throw createUserError('チャンネルを選択してください。');
    const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (!channel || !channel.isTextBased?.() || typeof channel.send !== 'function') {
        throw createUserError('案内を表示できるテキストチャンネルを選択してください。');
    }
    return channel;
}

async function deleteVisibleCopies(channel, texts) {
    const targets = new Set([...texts].filter(Boolean));
    if (targets.size === 0) return 0;
    const botId = channel.client?.user?.id;
    if (!botId) return 0;

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return 0;
    const matches = messages.filter(message => message.author?.id === botId && targets.has(message.content));
    let deleted = 0;
    for (const message of matches.values()) {
        const ok = await message.delete().then(() => true).catch(() => false);
        if (ok) deleted += 1;
    }
    return deleted;
}

export async function listWebAnnouncements(guildId, guild) {
    const pool = await getDBPool();
    const result = await pool.query(
        'SELECT channel_id, message FROM announcements WHERE guild_id = $1 ORDER BY channel_id',
        [guildId],
    );
    return result.rows.map(row => ({
        channelId: row.channel_id,
        channelName: guild.channels.cache.get(row.channel_id)?.name || row.channel_id,
        message: row.message,
    }));
}

export async function saveWebAnnouncement(guildId, payload, guild) {
    const channel = await resolveAnnouncementChannel(guild, payload?.channelId);
    const message = normalizeAnnouncementText(payload?.message);
    const pool = await getDBPool();
    const previous = await pool.query(
        'SELECT message FROM announcements WHERE guild_id = $1 AND channel_id = $2',
        [guildId, channel.id],
    );
    const previousMessage = previous.rows[0]?.message || null;

    await pool.query(
        `INSERT INTO announcements (guild_id, channel_id, message)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, channel_id) DO UPDATE SET message = EXCLUDED.message`,
        [guildId, channel.id, message],
    );
    invalidateAnnouncement(guildId, channel.id);

    await deleteVisibleCopies(channel, [previousMessage, message]);
    let posted = true;
    let warning = null;
    try {
        await channel.send({ content: message, flags: [MessageFlags.SuppressEmbeds] });
    } catch (error) {
        posted = false;
        warning = '設定は保存しましたが、Discordへの最初の表示に失敗しました。チャンネルでReactusに「メッセージを送信」権限があるか確認してください。';
        console.error('[Announcement] Initial sticky post failed:', error);
    }

    return {
        channelId: channel.id,
        channelName: channel.name || channel.id,
        message,
        posted,
        warning,
    };
}

export async function deleteWebAnnouncement(guildId, payload, guild) {
    const channel = await resolveAnnouncementChannel(guild, payload?.channelId);
    const pool = await getDBPool();
    const previous = await pool.query(
        'SELECT message FROM announcements WHERE guild_id = $1 AND channel_id = $2',
        [guildId, channel.id],
    );
    const previousMessage = previous.rows[0]?.message || null;
    const result = await pool.query(
        'DELETE FROM announcements WHERE guild_id = $1 AND channel_id = $2',
        [guildId, channel.id],
    );
    invalidateAnnouncement(guildId, channel.id);
    const removedVisibleMessages = previousMessage
        ? await deleteVisibleCopies(channel, [previousMessage])
        : 0;
    return {
        deleted: result.rowCount > 0,
        removedVisibleMessages,
    };
}
