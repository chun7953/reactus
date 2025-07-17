// /src/commands/admin/backup.js

import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { listReactionSettings } from '../../db/queries.js';
import { initializeDatabase } from '../../db/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('全てのサーバー設定をGoogle Sheetsにバックアップします。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const guildId = interaction.guild.id;

        try {
            const { auth, sheets, spreadsheetId } = await initializeSheetsAPI();
            const pool = await initializeDatabase();
            
            // リアクション
            const reactions = await listReactionSettings(guildId);
            const reactionValues = reactions.map(r => [r.guild_id, r.channel_id, r.emojis, r.trigger]);
            reactionValues.unshift(['guild_id', 'channel_id', 'emojis', 'trigger']);
            await updateSheet(sheets, auth, spreadsheetId, `Reactions_${guildId}`, 'A1:D', reactionValues);

            // アナウンス
            const announces = (await pool.query('SELECT * FROM announcements WHERE guild_id = $1', [guildId])).rows;
            const announceValues = announces.map(a => [a.guild_id, a.channel_id, a.message]);
            announceValues.unshift(['guild_id', 'channel_id', 'message']);
            await updateSheet(sheets, auth, spreadsheetId, `Announcements_${guildId}`, 'A1:C', announceValues);

            // カレンダーモニター
            const monitors = (await pool.query('SELECT * FROM calendar_monitors WHERE guild_id = $1', [guildId])).rows;
            const monitorValues = monitors.map(m => [m.guild_id, m.channel_id, m.calendar_id, m.trigger_keyword, m.mention_role]);
            monitorValues.unshift(['guild_id', 'channel_id', 'calendar_id', 'trigger_keyword', 'mention_role']);
            await updateSheet(sheets, auth, spreadsheetId, `CalendarMonitors_${guildId}`, 'A1:E', monitorValues);

            // メインカレンダー
            const configs = (await pool.query('SELECT * FROM guild_configs WHERE guild_id = $1', [guildId])).rows;
            const configValues = configs.map(c => [c.guild_id, c.main_calendar_id]);
            configValues.unshift(['guild_id', 'main_calendar_id']);
            await updateSheet(sheets, auth, spreadsheetId, `MainCalendars_${guildId}`, 'A1:B', configValues);

            await interaction.editReply(`✅ バックアップ完了！ 全ての設定をスプレッドシートに保存しました。`);

        } catch (error) {
            console.error('Backup failed:', error);
            await interaction.editReply('バックアップ中にエラーが発生しました。');
        }
    },
};

async function updateSheet(sheets, auth, spreadsheetId, sheetName, range, values) {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, auth });
    if (!spreadsheet.data.sheets.some(s => s.properties.title === sheetName)) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId, auth, requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
        });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, auth, range: `${sheetName}!${range}` });
    await sheets.spreadsheets.values.update({
        spreadsheetId, auth, range: `${sheetName}!A1`, valueInputOption: 'RAW', requestBody: { values },
    });
}