import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { cache, getDBPool } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stopannounce')
        .setDescription('このチャンネルの自動アナウンスを停止します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, channelId } = interaction;

        try {
            const pool = await getDBPool();
            const res = await pool.query('DELETE FROM announcements WHERE guild_id = $1 AND channel_id = $2', [guildId, channelId]);
            if (res.rowCount > 0) {
                cache.removeAnnouncement(guildId, channelId);
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