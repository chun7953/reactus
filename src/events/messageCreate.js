// src/events/messageCreate.js

import { Events, MessageFlags } from 'discord.js';
import { get } from '../lib/settingsCache.js';
import { resolveDiscordReactionValues } from '../lib/discordEmoji.js';

async function handleAutoReaction(message) {
    try {
        const settings = await get.reactionSettings(message.guild.id);
        const relevantSetting = settings.find(s =>
            s.channel_id === message.channel.id && message.content.includes(s.trigger)
        );

        if (relevantSetting) {
            let reactions;
            try {
                reactions = resolveDiscordReactionValues(relevantSetting.emojis, message.guild);
            } catch (error) {
                console.warn(`[AutoReaction] 無効な絵文字設定をスキップします: ${relevantSetting.emojis} (${error.message})`);
                return;
            }
            for (const reaction of reactions) {
                await message.react(reaction).catch(err => console.error('[AutoReaction] リアクション追加に失敗:', err));
            }
        }
    } catch (error) {
        console.error('Error in handleAutoReaction:', error);
    }
}

async function handleAutoAnnounce(message) {
    if (message.author.id === message.client.user.id) return;
    try {
        const announcement = await get.announcement(message.guild.id, message.channel.id);
        if (announcement) {
            const messages = await message.channel.messages.fetch({ limit: 20 });
            const oldAnnounce = messages.find(m => m.author.id === message.client.user.id && m.content === announcement.message);
            if (oldAnnounce) {
                await oldAnnounce.delete().catch(console.error);
            }
            await message.channel.send({
                content: announcement.message,
                flags: [MessageFlags.SuppressEmbeds]
            });
        }
    } catch (error) {
        console.error('Error in handleAutoAnnounce:', error);
    }
}

export default {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.guild) return;
        await Promise.all([
            handleAutoReaction(message),
            handleAutoAnnounce(message),
        ]);
    },
};
