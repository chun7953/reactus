// src/commands/utility/listsettings.js

import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { get, getDBPool } from '../../lib/settingsCache.js';

function canViewChannel(guild, user, channelId) {
    return Boolean(guild.channels.cache.get(channelId)?.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel));
}

export default {
    data: new SlashCommandBuilder()
        .setName('listsettings')
        .setDescription('現在の自動設定（投稿、リアクション、チャンネル案内）の一覧を表示します。'),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guild, user } = interaction;

        try {
            let response = '### ⚙️ 現在のサーバー設定一覧\n';

            const config = await get.guildConfig(guild.id);
            if (config && config.main_calendar_id) {
                response += `**メインカレンダー**: \`${config.main_calendar_id}\`\n\n`;
            } else {
                response += '**メインカレンダー**: 未設定\n\n';
            }

            const reactionSettings = await get.reactionSettings(guild.id);
            const accessibleReactions = reactionSettings.filter(row => canViewChannel(guild, user, row.channel_id));
            if (accessibleReactions.length > 0) {
                response += '**自動リアクション**\n';
                accessibleReactions.forEach(row => {
                    response += `・ <#${row.channel_id}> | 反応する言葉: \`${row.trigger}\` | 絵文字: ${row.emojis}\n`;
                });
            }

            const calendarSettings = await get.monitorsByGuild(guild.id);
            const accessibleCalendars = calendarSettings.filter(row => canViewChannel(guild, user, row.channel_id));
            if (accessibleCalendars.length > 0) {
                response += '\n**カレンダーからの自動投稿**\n';
                accessibleCalendars.forEach(row => {
                    response += `・ <#${row.channel_id}> | 予定を見分ける合図: \`【${row.trigger_keyword}】\` | カレンダーID: \`${row.calendar_id}\`\n`;
                });
            }

            const pool = await getDBPool();
            const announcementResult = await pool.query(
                'SELECT channel_id FROM announcements WHERE guild_id = $1 ORDER BY channel_id',
                [guild.id],
            );
            const accessibleAnnouncements = announcementResult.rows.filter(row => canViewChannel(guild, user, row.channel_id));
            if (accessibleAnnouncements.length > 0) {
                response += '\n**チャンネル下部の案内**\n';
                accessibleAnnouncements.forEach(row => {
                    response += `・ <#${row.channel_id}> | 設定中（内容の確認・編集は \`/reactus\` の管理画面からできます）\n`;
                });
            }

            if (
                accessibleReactions.length === 0
                && accessibleCalendars.length === 0
                && accessibleAnnouncements.length === 0
            ) {
                response += 'このサーバーには、表示できる個別の自動設定はありません。';
            }

            const chunks = response.match(/[\s\S]{1,1900}/g) || [];
            for (let i = 0; i < chunks.length; i++) {
                if (i === 0) await interaction.editReply(chunks[i]);
                else await interaction.followUp({ content: chunks[i], flags: [MessageFlags.Ephemeral] });
            }
        } catch (error) {
            console.error('Error in listsettings command:', error);
            await interaction.editReply('設定の取得中にエラーが発生しました。');
        }
    },
};
