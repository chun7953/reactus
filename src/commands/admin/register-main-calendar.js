import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { setWebMainCalendar } from '../../lib/webCalendarMonitorService.js';

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
            await setWebMainCalendar(guildId, calendarId);
            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess
                ? '\n設定は自動でバックアップされました。'
                : '\n注意: 設定のバックアップに失敗しました。';
            await interaction.editReply(`✅ **メインカレンダーを登録しました。**${backupMessage}`);
        } catch (error) {
            console.error('Failed to register main calendar:', error);
            await interaction.editReply(`メインカレンダーの登録中にエラーが発生しました。\n${error.message || '詳細不明のエラー'}`);
        }
    },
};
