// src/commands/announce/startannounce.js (修正後・完全版)

import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { triggerAutoBackup } from '../../lib/autoBackup.js';
import { getDBPool } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('startannounce')
        .setDescription('このチャンネルに自動アナウンスを設定します。')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('アナウンスするメッセージ')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId, channel, options } = interaction;
        const messageContent = options.getString('message');

        try {
            const pool = await getDBPool();
            const sql = `
                INSERT INTO announcements (guild_id, channel_id, message) VALUES ($1, $2, $3)
                ON CONFLICT (guild_id, channel_id) DO UPDATE SET message = excluded.message
            `;
            await pool.query(sql, [guildId, channel.id, messageContent]);

            await channel.send({
                content: messageContent,
                flags: [MessageFlags.SuppressEmbeds]
            });

            const backupSuccess = await triggerAutoBackup(guildId);
            const backupMessage = backupSuccess ? "\n設定は自動でバックアップされました。" : "\n注意: 設定のバックアップに失敗しました。";

            await interaction.editReply(`✅ アナウンスを設定し、最初のメッセージを送信しました。${backupMessage}`);
        } catch (error) {
            console.error('Error in startannounce:', error);
            await interaction.editReply('アナウンスの設定中にエラーが発生しました。');
        }
    },
};