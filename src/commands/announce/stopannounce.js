import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { deleteAnnouncement } from '../../db/queries.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stopannounce')
        .setDescription('このチャンネルの自動アナウンスを停止します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, channelId } = interaction;

        try {
            const changes = await deleteAnnouncement(guildId, channelId);
            if (changes > 0) {
                const backupSuccess = await triggerAutoBackup(guildId);
                const backupMessage = backupSuccess ? "設定は自動でバックアップされました。" : "注意: 設定のバックアップに失敗しました。";
                await interaction.editReply(`✅ このチャンネルのアナウンスを停止しました。${backupMessage}`);
            } else {
                await interaction.editReply('このチャンネルにはアナウンスが設定されていません。');
            }
        } catch (error) {
            console.error('Error in stopannounce:', error);
            await interaction.editReply('アナウンスの停止中にエラーが発生しました。');
        }
    },
};