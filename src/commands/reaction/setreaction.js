// src/commands/reaction/setreaction.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { get, getDBPool, invalidateReactionSettings } from '../../lib/settingsCache.js';
import { descriptorsToReactionCsv, normalizeDiscordEmojiList } from '../../lib/discordEmoji.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setreaction')
        .setDescription('自動リアクションを設定します。')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('リアクションを設定するチャンネル')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('emojis')
                .setDescription('Discordで使える絵文字（カンマ区切り。サーバー絵文字も可）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('trigger')
                .setDescription('トリガーワード')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { guildId, options, guild } = interaction;
        const channel = options.getChannel('channel');
        const rawEmojis = options.getString('emojis');
        const trigger = options.getString('trigger');

        try {
            await guild.emojis.fetch().catch(() => null);
            const emojiById = new Map([...guild.emojis.cache.values()].map(emoji => [emoji.id, emoji]));
            const emojiIds = new Set(emojiById.keys());
            const descriptors = normalizeDiscordEmojiList(rawEmojis, { guildEmojiIds: emojiIds, max: 20 });
            if (descriptors.length < 1) {
                return interaction.editReply('リアクション絵文字を1つ以上指定してください。');
            }
            const emojis = descriptorsToReactionCsv(descriptors, emojiById);

            const reactionSettings = await get.reactionSettings(guildId);
            if (reactionSettings.length >= 100) {
                return interaction.editReply('このサーバーで設定できるリアクションの上限(100件)に達しました。');
            }

            if (reactionSettings.find(s => s.channel_id === channel.id && s.trigger === trigger)) {
                return interaction.editReply('そのトリガーは既に使用されています。 `/removereaction` で一度削除してください。');
            }

            const pool = await getDBPool();
            const sql = 'INSERT INTO reactions (guild_id, channel_id, emojis, trigger) VALUES ($1, $2, $3, $4)';
            await pool.query(sql, [guildId, channel.id, emojis, trigger]);
            invalidateReactionSettings(guildId);

            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? '設定は自動でバックアップされました。' : '注意: 設定のバックアップに失敗しました。';

            await interaction.editReply(`✅ **リアクションを設定しました**\nチャンネル: ${channel}\nトリガー: \`${trigger}\`\n絵文字: ${emojis}\n${backupMessage}`);
        } catch (error) {
            console.error('Failed to set reaction:', error);
            await interaction.editReply(`設定できませんでした: ${error.message}`);
        }
    },
};
