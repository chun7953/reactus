import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { initializeDatabase } from '../../db/database.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { google } from 'googleapis';
import { triggerAutoBackup } from '../../lib/autoBackup.js';

export default {
    data: new SlashCommandBuilder()
        .setName('register-main-calendar')
        .setDescription('このサーバーのメインカレンダーを登録・更新します。')
        .addStringOption(option =>
            option.setName('calendar_id')
                .setDescription('カレンダーのID（Gmailアドレスなど）')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, options } = interaction;
        const calendarId = options.getString('calendar_id');

        try {
            // アクセス権チェック
            try {
                const { auth } = await initializeSheetsAPI();
                const calendar = google.calendar({ version: 'v3', auth });
                await calendar.calendars.get({ calendarId: calendarId });
            } catch (apiError) {
                if (apiError.code === 404) {
                    const { auth } = await initializeSheetsAPI();
                    return interaction.editReply(`**エラー: カレンダーにアクセスできません。**\n\nカレンダー(\`${calendarId}\`)の共有設定に、以下のアカウントを「閲覧者」として追加してください。\n\`\`\`${auth.email}\`\`\``);
                }
                throw apiError;
            }

            const pool = await initializeDatabase();
            const sql = `INSERT INTO guild_configs (guild_id, main_calendar_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET main_calendar_id = excluded.main_calendar_id`;
            await pool.query(sql, [guildId, calendarId]);
            
            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? "\n設定は自動でバックアップされました。" : "\n注意: 設定のバックアップに失敗しました。";

            await interaction.editReply(`✅ **メインカレンダーを登録しました。**${backupMessage}`);
        } catch (error) {
            console.error("Failed to register main calendar:", error);
            await interaction.editReply('メインカレンダーの登録中にエラーが発生しました。');
        }
    },
};