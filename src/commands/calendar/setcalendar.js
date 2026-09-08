import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { get } from '../../lib/settingsCache.js';
import { createWebCalendarMonitor } from '../../lib/webCalendarMonitorService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setcalendar')
        .setDescription('カレンダー通知を設定します。ID省略時はメインカレンダーを使用。')
        .addStringOption(option =>
            option.setName('trigger_keyword')
                .setDescription('トリガーキーワード（【】は不要。例: ご連絡, GvGアンケ）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('calendar_id')
                .setDescription('（任意）監視するカレンダーのID。省略するとメインカレンダーを使用。')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('mention_role')
                .setDescription('（任意）通知時に必ずメンションするロール')),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const calendarIdInput = interaction.options.getString('calendar_id');
        const triggerKeyword = interaction.options.getString('trigger_keyword');
        const mentionRole = interaction.options.getRole('mention_role');
        const { channelId, guildId, guild } = interaction;

        try {
            let targetCalendarId = calendarIdInput;
            if (!targetCalendarId) {
                const mainCal = await get.guildConfig(guildId);
                targetCalendarId = mainCal?.main_calendar_id || null;
                if (!targetCalendarId) {
                    return interaction.editReply('エラー: カレンダーIDが指定されておらず、メインカレンダーも未登録です。\n`/register-main-calendar` またはReactus管理画面で登録してください。');
                }
            }

            const monitor = await createWebCalendarMonitor(guildId, {
                channelId,
                calendarId: targetCalendarId,
                triggerKeyword,
                mentionRoleId: mentionRole?.id || null,
            }, guild);

            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? '設定は自動でバックアップされました。' : '注意: 設定のバックアップに失敗しました。';

            await interaction.editReply(
                `✅ **設定完了**\n・対象カレンダー: \`${monitor.calendarId}\`\n・キーワード: \`【${monitor.triggerKeyword}】\`\n${backupMessage}`,
            );
        } catch (error) {
            console.error('Failed to set calendar monitor:', error);
            await interaction.editReply(`設定の保存中にエラーが発生しました。\n${error.message || '詳細不明のエラー'}`);
        }
    },
};
