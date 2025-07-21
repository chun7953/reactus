import { Events } from 'discord.js';
import { listReactionSettings, getAnnouncement } from '../db/queries.js';

async function handleAutoReaction(message, db) {
    try {
        const settings = await listReactionSettings(message.guild.id);
        const relevantSetting = settings.find(s =>
            s.channel_id === message.channel.id && message.content.includes(s.trigger)
        );

        if (relevantSetting) {
            const emojis = relevantSetting.emojis.split(',');
            for (const emoji of emojis) {
                await message.react(emoji.trim()).catch(err => console.error(`Failed to auto-react with ${emoji}:`, err));
            }
        }
    } catch (error) {
        console.error('Error in handleAutoReaction:', error);
    }
}

async function handleAutoAnnounce(message, db) {
    // 自分自身のメッセージはアナウンスの再投稿対象外
    if (message.author.id === message.client.user.id) return;

    try {
        const announcement = await getAnnouncement(message.guild.id, message.channel.id);
        if (announcement) {
            const messages = await message.channel.messages.fetch({ limit: 20 });
            const oldAnnounce = messages.find(m => m.author.id === message.client.user.id && m.content === announcement.message);
            if (oldAnnounce) {
                await oldAnnounce.delete().catch(console.error);
            }
            await message.channel.send(announcement.message);
        }
    } catch (error) {
        console.error('Error in handleAutoAnnounce:', error);
    }
}

export default {
    name: Events.MessageCreate,
    async execute(message, db) {
        // ★★★ここを修正しました！★★★
        // ボット自身のメッセージを無視する条件を削除しました。
        if (!message.guild) return;

        // これで、ボット自身のメッセージ(カレンダー投稿など)にも自動リアクションが付与されるようになります。
        await handleAutoReaction(message, db);
        
        // handleAutoAnnounceは、関数内で自身のメッセージを無視するようになっているため、この変更による影響はありません。
        await handleAutoAnnounce(message, db);
    },
};