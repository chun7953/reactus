import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { getReactionSettings, getMonitorsByGuild, getMainCalendar } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('listsettings')
        .setDescription('現在の全ての自動設定（リアクション、カレンダー）の一覧を表示します。'),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guild, user } = interaction;

        try {
            let response = '### ⚙️ 現在のサーバー設定一覧\n';
            
            const mainCal = getMainCalendar(guild.id);
            if (mainCal && mainCal.main_calendar_id) {
                response += `**メインカレンダー**: \`${mainCal.main_calendar_id}\`\n\n`;
            } else {
                response += '**メインカレンダー**: 未設定\n\n';
            }

            const reactionSettings = getReactionSettings(guild.id);
            const accessibleReactions = reactionSettings.filter(row => guild.channels.cache.get(row.channel_id)?.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel));
            if (accessibleReactions.length > 0) {
                response += '**自動リアクション設定**\n';
                accessibleReactions.forEach(row => {
                    response += `・ <#${row.channel_id}> | トリガー: \`${row.trigger}\` | 絵文字: ${row.emojis}\n`;
                });
            }

            const calendarSettings = getMonitorsByGuild(guild.id);
            const accessibleCalendars = calendarSettings.filter(row => guild.channels.cache.get(row.channel_id)?.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel));
            if (accessibleCalendars.length > 0) {
                response += '\n**カレンダー通知設定**\n';
                accessibleCalendars.forEach(row => {
                    response += `・ <#${row.channel_id}> | キーワード: \`【${row.trigger_keyword}】\` | カレンダーID: \`${row.calendar_id}\`\n`;
                });
            }
            
            if (accessibleReactions.length === 0 && accessibleCalendars.length === 0) {
                response += 'リアクションやカレンダーの個別設定はありません。';
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