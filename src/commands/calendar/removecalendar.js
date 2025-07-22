import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { removeCalendarMonitor, getDBPool } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('removecalendar')
        .setDescription('このチャンネルに登録されているカレンダー通知設定を解除します。')
        .addStringOption(option =>
            option.setName('trigger_keyword')
                .setDescription('解除したい設定のトリガーキーワード（【】は不要）')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const triggerKeyword = interaction.options.getString('trigger_keyword').replace(/[【】]/g, '');
        const { channelId, guildId } = interaction;

        try {
            const pool = await getDBPool();
            const sql = 'DELETE FROM calendar_monitors WHERE guild_id = $1 AND channel_id = $2 AND trigger_keyword = $3';
            const res = await pool.query(sql, [guildId, channelId, triggerKeyword]);

            if (res.rowCount > 0) {
                // キャッシュを更新
                removeCalendarMonitor(guildId, channelId, triggerKeyword);
                
                const backupSuccess = await triggerAutoBackup(guildId);
                const backupMessage = backupSuccess ? "設定は自動でバックアップされました。" : "注意: 設定のバックアップに失敗しました。";
                await interaction.editReply(`✅ **設定を解除しました。**${backupMessage}`);
            } else {
                await interaction.editReply('指定されたキーワードの通知設定は、このチャンネルには見つかりませんでした。');
            }
        } catch (error) {
            console.error("Failed to remove calendar monitor:", error);
            await interaction.editReply('設定の解除中にエラーが発生しました。');
        }
    },
};