// src/commands/announce/startannounce.js

import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { saveWebAnnouncement } from '../../lib/webAnnouncementService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('startannounce')
        .setDescription('このチャンネルに下部固定アナウンスを設定します。')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('チャンネルの一番下に表示し続ける案内文')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, guild, channelId, options } = interaction;

        try {
            const result = await saveWebAnnouncement(guildId, {
                channelId,
                message: options.getString('message'),
            }, guild);
            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess
                ? '\n設定は自動でバックアップされました。'
                : '\n注意: 設定のバックアップに失敗しました。';
            const postMessage = result.posted
                ? '\n最初の案内もチャンネルへ表示しました。'
                : `\n${result.warning}`;
            await interaction.editReply(`✅ このチャンネルの下部固定アナウンスを設定しました。${postMessage}${backupMessage}`);
        } catch (error) {
            console.error('Error in startannounce:', error);
            await interaction.editReply(error.message || 'アナウンスの設定中にエラーが発生しました。');
        }
    },
};
