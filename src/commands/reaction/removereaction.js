import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { cache, getDBPool } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('removereaction')
        .setDescription('自動リアクション設定を解除します。')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('設定を解除するチャンネル')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('trigger')
                .setDescription('解除するトリガーワード')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const { guildId, options } = interaction;
        const channel = options.getChannel('channel');
        const trigger = options.getString('trigger');

        try {
            const pool = await getDBPool();
            const res = await pool.query('DELETE FROM reactions WHERE guild_id = $1 AND channel_id = $2 AND trigger = $3', [guildId, channel.id, trigger]);

            if (res.rowCount > 0) {
                cache.removeReactionSetting(guildId, channel.id, trigger);
                const backupSuccess = await triggerAutoBackup(guildId);
                const backupMessage = backupSuccess ? "設定は自動でバックアップされました。" : "注意: 設定のバックアップに失敗しました。";
                await interaction.editReply(`✅ **設定を解除しました**\nチャンネル: ${channel}\nトリガー: \`${trigger}\`\n${backupMessage}`);
            } else {
                await interaction.editReply('指定された設定は見つかりませんでした。');
            }
        } catch (error) {
            console.error("Failed to remove reaction:", error);
            await interaction.editReply('設定の解除中にエラーが発生しました。');
        }
    },
};