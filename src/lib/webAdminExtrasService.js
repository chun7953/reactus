import {
    get,
    getDBPool,
    invalidateReactionSettings,
} from './settingsCache.js';
import {
    descriptorsForClient,
    descriptorsToReactionCsv,
    normalizeDiscordEmojiList,
} from './discordEmoji.js';

function guildEmojiMaps(guild) {
    const byId = new Map();
    const ids = new Set();
    for (const emoji of guild.emojis.cache.values()) {
        byId.set(emoji.id, emoji);
        ids.add(emoji.id);
    }
    return { byId, ids };
}

export async function listWebReactionRules(guildId, guild) {
    const settings = await get.reactionSettings(guildId);
    const { ids } = guildEmojiMaps(guild);
    return settings.map(setting => {
        let emojis = [];
        let invalid = false;
        try {
            emojis = descriptorsForClient(setting.emojis, ids);
        } catch {
            invalid = true;
        }
        return {
            channelId: setting.channel_id,
            trigger: setting.trigger,
            emojis,
            rawEmojis: setting.emojis,
            invalid,
        };
    });
}

function validateRulePayload(payload, guild) {
    const channelId = String(payload?.channelId || '').trim();
    const trigger = String(payload?.trigger || '').trim();
    if (!/^\d+$/.test(channelId)) throw new Error('チャンネルを選択してください。');
    if (!trigger) throw new Error('トリガーを入力してください。');
    if (trigger.length > 200) throw new Error('トリガーが長すぎます。');
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased?.()) throw new Error('リアクション対象のテキストチャンネルを選択してください。');
    const { byId, ids } = guildEmojiMaps(guild);
    const descriptors = normalizeDiscordEmojiList(payload?.emojis || [], { guildEmojiIds: ids, max: 20 });
    if (descriptors.length < 1) throw new Error('リアクション絵文字を1つ以上選択してください。');
    return {
        channelId,
        trigger,
        emojis: descriptorsToReactionCsv(descriptors, byId),
    };
}

export async function createWebReactionRule(guildId, payload, guild) {
    const rule = validateRulePayload(payload, guild);
    const existing = await get.reactionSettings(guildId);
    if (existing.length >= 100) throw new Error('このサーバーで設定できるリアクションの上限(100件)に達しました。');
    if (existing.some(item => item.channel_id === rule.channelId && item.trigger === rule.trigger)) {
        throw new Error('同じチャンネルとトリガーの設定が既にあります。');
    }
    const pool = await getDBPool();
    await pool.query(
        'INSERT INTO reactions (guild_id, channel_id, emojis, trigger) VALUES ($1, $2, $3, $4)',
        [guildId, rule.channelId, rule.emojis, rule.trigger],
    );
    invalidateReactionSettings(guildId);
    return rule;
}

export async function updateWebReactionRule(guildId, payload, guild) {
    const originalChannelId = String(payload?.originalChannelId || '').trim();
    const originalTrigger = String(payload?.originalTrigger || '').trim();
    if (!originalChannelId || !originalTrigger) throw new Error('更新元のリアクション設定を特定できません。');
    const rule = validateRulePayload(payload, guild);
    const pool = await getDBPool();
    const result = await pool.query(
        `UPDATE reactions
         SET channel_id = $1, emojis = $2, trigger = $3
         WHERE guild_id = $4 AND channel_id = $5 AND trigger = $6`,
        [rule.channelId, rule.emojis, rule.trigger, guildId, originalChannelId, originalTrigger],
    );
    if (result.rowCount === 0) throw new Error('更新するリアクション設定が見つかりません。');
    invalidateReactionSettings(guildId);
    return rule;
}

export async function deleteWebReactionRule(guildId, payload) {
    const channelId = String(payload?.channelId || '').trim();
    const trigger = String(payload?.trigger || '').trim();
    if (!channelId || !trigger) throw new Error('削除するリアクション設定を特定できません。');
    const pool = await getDBPool();
    const result = await pool.query(
        'DELETE FROM reactions WHERE guild_id = $1 AND channel_id = $2 AND trigger = $3',
        [guildId, channelId, trigger],
    );
    if (result.rowCount === 0) throw new Error('削除するリアクション設定が見つかりません。');
    invalidateReactionSettings(guildId);
    return { deleted: true };
}

export function guildEmojiPayload(guild) {
    return [...guild.emojis.cache.values()]
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
        .map(emoji => ({
            id: emoji.id,
            name: emoji.name,
            animated: Boolean(emoji.animated),
            url: emoji.imageURL({ extension: emoji.animated ? 'gif' : 'webp', size: 64 }),
        }));
}

export function textChannelPayload(guild) {
    return [...guild.channels.cache.values()]
        .filter(channel => channel?.isTextBased?.() && !channel?.isDMBased?.())
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
        .map(channel => ({ id: channel.id, name: channel.name || channel.id }));
}
