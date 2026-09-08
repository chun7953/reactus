import { get } from './settingsCache.js';
import { resolveDiscordReactionValues } from './discordEmoji.js';

function alreadyReacted(message, reaction) {
    const cache = message?.reactions?.cache;
    if (!cache?.some) return false;
    const customId = typeof reaction === 'string' ? null : reaction?.id;
    return cache.some(existing => {
        if (!existing?.me) return false;
        if (customId) return existing.emoji?.id === customId;
        return existing.emoji?.id == null && existing.emoji?.name === reaction;
    });
}

export async function applyConfiguredAutoReactions(message, { logger = console } = {}) {
    if (!message?.guild?.id || !message?.channel?.id || typeof message.content !== 'string' || typeof message.react !== 'function') {
        return { matched: false, reacted: 0 };
    }

    const settings = await get.reactionSettings(message.guild.id);
    const relevantSetting = settings.find(setting =>
        setting.channel_id === message.channel.id && message.content.includes(setting.trigger)
    );
    if (!relevantSetting) return { matched: false, reacted: 0 };

    let reactions;
    try {
        reactions = resolveDiscordReactionValues(relevantSetting.emojis, message.guild);
    } catch (error) {
        logger.warn?.(`[AutoReaction] 無効な絵文字設定をスキップします: ${relevantSetting.emojis} (${error.message})`);
        return { matched: true, reacted: 0, invalid: true };
    }

    let reacted = 0;
    for (const reaction of reactions) {
        if (alreadyReacted(message, reaction)) continue;
        try {
            await message.react(reaction);
            reacted += 1;
        } catch (error) {
            logger.error?.('[AutoReaction] リアクション追加に失敗:', error);
        }
    }
    return { matched: true, reacted };
}
