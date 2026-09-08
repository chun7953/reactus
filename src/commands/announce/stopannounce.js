// src/commands/announce/stopannounce.js

import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { deleteWebAnnouncement } from '../../lib/webAnnouncementService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stopannounce')
        .setDescription('このチャンネルの下部固定アナウンスを停止します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, guild, channelId } = interaction;

        try {
            const result = await deleteWebAnnouncement(guildId, { channelId }, guild);
            if (!result.deleted) {
                await interaction.editReply('このチャンネルには下部固定アナウンスが設定されていません。');
                return;
            }
            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess
                ? '\n設定は自動でバックアップされました。'
                : '\n注意: 設定のバックアップに失敗しました。';
            await interaction.editReply(`✅ このチャンネルの下部固定アナウンスを停止し、表示中の案内も削除しました。${backupMessage}`);
        } catch (error) {
            console.error('Error in stopannounce:', error);
            await interaction.editReply(error.message || 'アナウンスの停止中にエラーが発生しました。');
        }
    },
};
