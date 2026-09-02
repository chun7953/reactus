// src/commands/admin/restore.js (修正後・完全版)

import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { restoreGuildSettings } from '../../lib/restoreSettings.js';
import { getDBPool } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('restore')
        .setDescription('Google Sheetsから全てのサーバー設定を復元（上書き）します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId } = interaction;

        try {
            const { auth, sheets, spreadsheetId } = await initializeSheetsAPI();
            const pool = await getDBPool();

            // Fetch every external resource before starting the database transaction.
            const [reactions, announcements, calendarMonitors, guildConfigs] = await Promise.all([
                getSheetData(sheets, auth, spreadsheetId, `Reactions_${guildId}!A2:D`),
                getSheetData(sheets, auth, spreadsheetId, `Announcements_${guildId}!A2:C`),
                getSheetData(sheets, auth, spreadsheetId, `CalendarMonitors_${guildId}!A2:E`),
                getSheetData(sheets, auth, spreadsheetId, `GuildConfigs_${guildId}!A2:C`),
            ]);

            const counts = await restoreGuildSettings(pool, guildId, {
                reactions,
                announcements,
                calendarMonitors,
                guildConfigs,
            });

            await interaction.editReply(`✅ 復元完了！ データベースを更新しました。\n(リアクション: ${counts.reactions}件, アナウンス: ${counts.announces}件, カレンダー通知: ${counts.monitors}件, サーバー設定: ${counts.configs}件)`);

        } catch (error) {
            console.error('Restore failed:', error);
            await interaction.editReply('復元中にエラーが発生したため、データベースの変更を取り消しました。');
        }
    },
};

async function getSheetData(sheets, auth, spreadsheetId, range) {
    try {
        const response = await sheets.spreadsheets.values.get({ auth, spreadsheetId, range });
        return response.data.values || [];
    } catch (error) {
        if (error.code === 400) return [];
        throw error;
    }
}
