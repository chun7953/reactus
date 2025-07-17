import { initializeSheetsAPI } from './sheetsAPI.js';
import { initializeDatabase } from '../db/database.js';

// --- スプレッドシート更新用のヘルパー関数 ---
async function updateSheet(sheets, auth, spreadsheetId, sheetName, range, values) {
    try {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, auth });
        if (!spreadsheet.data.sheets.some(s => s.properties.title === sheetName)) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId, auth, requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
            });
        }
        await sheets.spreadsheets.values.clear({ spreadsheetId, auth, range: `${sheetName}!${range}` });
        if (values.length > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId, auth, range: `${sheetName}!A1`, valueInputOption: 'RAW', requestBody: { values },
            });
        }
    } catch (error) {
        console.error(`Error updating sheet ${sheetName}:`, error.message);
        throw error;
    }
}

// ★★★これが、全てのコマンドから呼び出されるバックアップの本体です★★★
export async function triggerAutoBackup(guildId) {
    if (!guildId) {
        console.error("Auto-backup triggered without guildId.");
        return false;
    }
    console.log(`Triggering auto-backup for guild: ${guildId}`);
    try {
        const pool = await initializeDatabase();
        const { auth, sheets, spreadsheetId } = await initializeSheetsAPI();

        // Reactions
        const reactions = (await pool.query('SELECT * FROM reactions WHERE guild_id = $1', [guildId])).rows;
        const reactionValues = reactions.map(r => [r.guild_id, r.channel_id, r.emojis, r.trigger]);
        reactionValues.unshift(['guild_id', 'channel_id', 'emojis', 'trigger']);
        await updateSheet(sheets, auth, spreadsheetId, `Reactions_${guildId}`, 'A1:D', reactionValues);

        // Announcements
        const announces = (await pool.query('SELECT * FROM announcements WHERE guild_id = $1', [guildId])).rows;
        const announceValues = announces.map(a => [a.guild_id, a.channel_id, a.message]);
        announceValues.unshift(['guild_id', 'channel_id', 'message']);
        await updateSheet(sheets, auth, spreadsheetId, `Announcements_${guildId}`, 'A1:C', announceValues);

        // Calendar Monitors
        const monitors = (await pool.query('SELECT * FROM calendar_monitors WHERE guild_id = $1', [guildId])).rows;
        const monitorValues = monitors.map(m => [m.guild_id, m.channel_id, m.calendar_id, m.trigger_keyword, m.mention_role]);
        monitorValues.unshift(['guild_id', 'channel_id', 'calendar_id', 'trigger_keyword', 'mention_role']);
        await updateSheet(sheets, auth, spreadsheetId, `CalendarMonitors_${guildId}`, 'A1:E', monitorValues);

        // Main Calendar Configs
        const configs = (await pool.query('SELECT * FROM guild_configs WHERE guild_id = $1', [guildId])).rows;
        const configValues = configs.map(c => [c.guild_id, c.main_calendar_id]);
        configValues.unshift(['guild_id', 'main_calendar_id']);
        await updateSheet(sheets, auth, spreadsheetId, `MainCalendars_${guildId}`, 'A1:B', configValues);
        
        console.log(`Auto-backup for guild ${guildId} completed successfully.`);
        return true; // 成功
    } catch (error) {
        console.error(`Error during auto-backup for guild ${guildId}:`, error);
        return false; // 失敗
    }
}