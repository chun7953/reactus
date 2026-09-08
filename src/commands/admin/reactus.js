import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder,
} from 'discord.js';
import config from '../../config.js';
import { issueWebAdminLogin } from '../../lib/webAdminAuth.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reactus')
        .setDescription('Reactusの管理画面を開きます。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    cooldown: 0,
    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        } catch (error) {
            if (error?.code === 10062) {
                const ageMs = Number.isFinite(interaction.createdTimestamp)
                    ? Date.now() - interaction.createdTimestamp
                    : null;
                console.warn(`[reactus] Discord interaction expired before acknowledgement${ageMs === null ? '' : ` (${ageMs}ms)`}. Retry the command.`);
                return;
            }
            throw error;
        }

        try {
            const token = await issueWebAdminLogin(interaction.guildId, interaction.user.id);
            const url = `${config.web.publicBaseUrl}/admin/login?token=${encodeURIComponent(token)}`;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Reactus 管理画面を開く')
                    .setStyle(ButtonStyle.Link)
                    .setURL(url),
            );
            await interaction.editReply({
                content: '管理画面では、通常投稿・抽選・画像・メンション・繰り返し予定をフォームから設定できます。\nこのリンクは10分以内に開いてください。ログイン後のセッションは30日間有効です。',
                components: [row],
            });
        } catch (error) {
            console.error('[reactus] Failed to issue dashboard login:', error);
            await interaction.editReply('管理画面のログインリンクを作成できませんでした。');
        }
    },
};
