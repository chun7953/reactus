// src/lib/autoBackup.js

import { initializeSheetsAPI } from './sheetsAPI.js';
import { getDBPool } from './settingsCache.js';

async function updateSheet(sheets, auth, spreadsheetId, sheetName, range, values) {
    try {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, auth });
        if (!spreadsheet.data.sheets.some(s => s.properties.title === sheetName)) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId, auth, requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
            });
        }
        await sheets.spreadsheets.values.clear({ spreadsheetId, auth, range: `${sheetName}!${range}` });
        if (values.length > 0) { // ヘッダーのみの場合は書き込まない
            await sheets.spreadsheets.values.update({
                spreadsheetId, auth, range: `${sheetName}!A1`, valueInputOption: 'RAW', requestBody: { values },
            });
        }
    } catch (error) {
        console.error(`Error updating sheet ${sheetName}:`, error.message);
        throw error;
    }
}

export async function triggerAutoBackup(guildId) {
    if (!guildId) {
        console.error("Auto-backup triggered without guildId.");
        return false;
    }
    console.log(`Triggering auto-backup for guild: ${guildId}`);
    try {
        const pool = await getDBPool();
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
        const configValues = configs.map(c => [c.guild_id, c.main_calendar_id, c.giveaway_manager_roles]);
        configValues.unshift(['guild_id', 'main_calendar_id', 'giveaway_manager_roles']);
        await updateSheet(sheets, auth, spreadsheetId, `GuildConfigs_${guildId}`, 'A1:C', configValues);
        
        console.log(`Auto-backup for guild ${guildId} completed successfully.`);
        return true;
    } catch (error) {
        console.error(`Error during auto-backup for guild ${guildId}:`, error);
        return false;
    }
}