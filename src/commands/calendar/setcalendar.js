import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { google } from 'googleapis';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { getMainCalendar, addCalendarMonitor, getDBPool } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setcalendar')
        // ... (description and options are same)
        .addRoleOption(option =>
            option.setName('mention_role')
                .setDescription('（任意）通知時に必ずメンションするロール')),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        let calendarIdInput = interaction.options.getString('calendar_id');
        const triggerKeyword = interaction.options.getString('trigger_keyword').replace(/[【】]/g, '');
        const mentionRole = interaction.options.getRole('mention_role');
        const { channelId, guildId } = interaction;
        
        try {
            let targetCalendarId = calendarIdInput;
            if (!targetCalendarId) {
                const mainCal = getMainCalendar(guildId);
                if (mainCal && mainCal.main_calendar_id) {
                    targetCalendarId = mainCal.main_calendar_id;
                } else {
                    return interaction.editReply('エラー: カレンダーIDが指定されておらず、メインカレンダーも未登録です。\n`/register-main-calendar`で登録してください。');
                }
            }

            try {
                const { auth } = await initializeSheetsAPI();
                const calendar = google.calendar({ version: 'v3', auth });
                await calendar.calendars.get({ calendarId: targetCalendarId });
            } catch (apiError) {
                if (apiError.code === 404) {
                    const { auth } = await initializeSheetsAPI();
                    return interaction.editReply(`**エラー: カレンダーにアクセスできません。**\n\nカレンダー(\`${targetCalendarId}\`)の共有設定に、以下のアカウントを「閲覧者」として追加してください。\n\`\`\`${auth.email}\`\`\``);
                }
                throw apiError;
            }

            const pool = await getDBPool();
            const sql = 'INSERT INTO calendar_monitors (guild_id, channel_id, calendar_id, trigger_keyword, mention_role) VALUES ($1, $2, $3, $4, $5)';
            const values = [guildId, channelId, targetCalendarId, triggerKeyword, mentionRole ? mentionRole.id : null];
            await pool.query(sql, values);
            
            // キャッシュを更新
            addCalendarMonitor({
                guild_id: guildId, 
                channel_id: channelId, 
                calendar_id: targetCalendarId, 
                trigger_keyword: triggerKeyword, 
                mention_role: mentionRole ? mentionRole.id : null
            });
            
            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? "設定は自動でバックアップされました。" : "注意: 設定のバックアップに失敗しました。";

            let replyMessage = `✅ **設定完了**\n・対象カレンダー: \`${targetCalendarId}\`\n・キーワード: \`【${triggerKeyword}】\`\n${backupMessage}`;
            await interaction.editReply(replyMessage);

        } catch (error) {
            console.error("Failed to set calendar monitor:", error);
            await interaction.editReply('設定の保存中にエラーが発生しました。同じキーワードが既に登録されている可能性があります。');
        }
    },
};