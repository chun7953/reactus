import {
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder,
} from 'discord.js';
import {
    CalendarClaimChallengeError,
    ensureCalendarClaim,
} from '../../lib/calendarClaimService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify-calendar')
        .setDescription('GoogleカレンダーをこのDiscordサーバーで利用するため所有確認します。')
        .addStringOption(option => option
            .setName('calendar_id')
            .setDescription('所有確認するGoogleカレンダーID')
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const calendarId = interaction.options.getString('calendar_id');

        try {
            const result = await ensureCalendarClaim(interaction.guildId, calendarId, { allowChallenge: true });
            await interaction.editReply(
                result.newlyVerified
                    ? `✅ カレンダー \`${result.calendarId}\` の所有確認が完了しました。確認コードはGoogleカレンダーの説明欄から削除して構いません。`
                    : `✅ カレンダー \`${result.calendarId}\` は既にこのDiscordサーバーで所有確認済みです。`,
            );
        } catch (error) {
            if (!(error instanceof CalendarClaimChallengeError)) {
                console.error('Failed to verify calendar ownership:', error);
            }
            await interaction.editReply(error.message || 'カレンダーの所有確認に失敗しました。');
        }
    },
};