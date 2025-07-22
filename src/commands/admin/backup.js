import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';

export default {
    cooldown: 60,
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('全てのサーバー設定をGoogle Sheetsにバックアップします。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const guildId = interaction.guild.id;

        try {
            const success = await triggerAutoBackup(guildId);

            if (success) {
                await interaction.editReply(`✅ バックアップ完了！ 全ての設定をスプレッドシートに保存しました。`);
            } else {
                throw new Error("Backup process failed.");
            }

        } catch (error) {
            console.error('Backup failed:', error);
            await interaction.editReply('バックアップ中にエラーが発生しました。');
        }
    },
};