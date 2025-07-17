import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { addReactionSetting, findReactionSetting, getReactionSettingsCount } from '../../db/queries.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';

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
                .setDescription('リアクションとして追加する絵文字（カンマ区切り）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('trigger')
                .setDescription('トリガーワード')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { guildId, options } = interaction;
        const channel = options.getChannel('channel');
        const emojis = options.getString('emojis');
        const trigger = options.getString('trigger');

        try {
            const count = await getReactionSettingsCount(guildId);
            if (count >= 100) {
                return interaction.editReply('このサーバーで設定できるリアクションの上限(100件)に達しました。');
            }

            const existing = await findReactionSetting(guildId, channel.id, trigger);
            if (existing) {
                return interaction.editReply('そのトリガーは既に使用されています。 `/removereaction` で一度削除してください。');
            }

            await addReactionSetting(guildId, channel.id, emojis, trigger);

            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? "設定は自動でバックアップされました。" : "注意: 設定のバックアップに失敗しました。";
            
            await interaction.editReply(`✅ **リアクションを設定しました**\nチャンネル: ${channel}\nトリガー: \`${trigger}\`\n${backupMessage}`);

        } catch (error) {
            console.error('Failed to set reaction:', error);
            await interaction.editReply('設定中にエラーが発生しました。');
        }
    },
};