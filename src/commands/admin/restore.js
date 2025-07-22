import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { getDBPool, initializeCache } from '../../lib/settingsCache.js'; // initializeCacheを追加

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
            let counts = { reactions: 0, announces: 0, monitors: 0, configs: 0 };

            // データベースをクリアしてから挿入
            await pool.query('DELETE FROM reactions WHERE guild_id = $1', [guildId]);
            const reactionData = await getSheetData(sheets, auth, spreadsheetId, `Reactions_${guildId}!A2:D`);
            for(const row of reactionData) {
                await pool.query('INSERT INTO reactions (guild_id, channel_id, emojis, trigger) VALUES ($1, $2, $3, $4)', row);
                counts.reactions++;
            }

            await pool.query('DELETE FROM announcements WHERE guild_id = $1', [guildId]);
            const announceData = await getSheetData(sheets, auth, spreadsheetId, `Announcements_${guildId}!A2:C`);
            for(const row of announceData) {
                await pool.query('INSERT INTO announcements (guild_id, channel_id, message) VALUES ($1, $2, $3) ON CONFLICT (guild_id, channel_id) DO UPDATE SET message = excluded.message', row);
                counts.announces++;
            }
            
            await pool.query('DELETE FROM calendar_monitors WHERE guild_id = $1', [guildId]);
            const monitorData = await getSheetData(sheets, auth, spreadsheetId, `CalendarMonitors_${guildId}!A2:E`);
            for(let row of monitorData) {
                while (row.length < 5) row.push(null);
                await pool.query('INSERT INTO calendar_monitors (guild_id, channel_id, calendar_id, trigger_keyword, mention_role) VALUES ($1, $2, $3, $4, $5)', row);
                counts.monitors++;
            }

            await pool.query('DELETE FROM guild_configs WHERE guild_id = $1', [guildId]);
            const configData = await getSheetData(sheets, auth, spreadsheetId, `MainCalendars_${guildId}!A2:B`);
            for(const row of configData) {
                 await pool.query('INSERT INTO guild_configs (guild_id, main_calendar_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET main_calendar_id = excluded.main_calendar_id', row);
                 counts.configs++;
            }
            
            // ★ データベースを復元したので、キャッシュも再構築する
            await initializeCache();

            await interaction.editReply(`✅ 復元完了！ データベースとキャッシュを更新しました。\n(リアクション: ${counts.reactions}件, アナウンス: ${counts.announces}件, カレンダー通知: ${counts.monitors}件, メインカレンダー: ${counts.configs}件)`);

        } catch (error) {
            console.error('Restore failed:', error);
            await interaction.editReply('復元中にエラーが発生しました。');
        }
    },
};

async function getSheetData(sheets, auth, spreadsheetId, range) {
    try {
        const response = await sheets.spreadsheets.values.get({ auth, spreadsheetId, range });
        return response.data.values || [];
    } catch (error) {
        if (error.code === 400) return []; // シートが存在しない場合は空配列を返す
        throw error;
    }
}