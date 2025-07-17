import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { saveAnnouncement } from '../../db/queries.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';

export default {
    data: new SlashCommandBuilder()
        .setName('startannounce')
        .setDescription('このチャンネルに自動アナウンスを設定します。')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('アナウンスするメッセージ')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, channel, options } = interaction;
        const messageContent = options.getString('message');

        try {
            await saveAnnouncement(guildId, channel.id, messageContent);
            await channel.send(messageContent);
            
            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? "\n設定は自動でバックアップされました。" : "\n注意: 設定のバックアップに失敗しました。";

            await interaction.editReply(`✅ アナウンスを設定し、最初のメッセージを送信しました。${backupMessage}`);
        } catch (error) {
            console.error('Error in startannounce:', error);
            await interaction.editReply('アナウンスの設定中にエラーが発生しました。');
        }
    },
};