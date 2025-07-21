import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ReactionExporter } from '../../lib/reactionExporter.js';

export default {
    data: new SlashCommandBuilder()
        .setName('csvreactions')
        .setDescription('指定メッセージのリアクションをCSVで集計します。')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('リアクションを集計したいメッセージのID')
                .setRequired(true))
        .addBooleanOption(option => // ← このオプションを追加
            option.setName('public')
                .setDescription('結果を全員に公開しますか？（デフォルトは自分のみ）')
                .setRequired(false)),
    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');
        const isPublic = interaction.options.getBoolean('public') ?? false; // ← オプションの値を取得

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            const exporter = new ReactionExporter(interaction.client, message);
            // isPublic の値を渡す
            await exporter.execute(interaction, isPublic);
        } catch (error) {
            console.error('CSV export command failed:', error);
            await interaction.reply({ content: '指定されたメッセージIDが見つからないか、エラーが発生しました。', flags: [MessageFlags.Ephemeral] });
        }
    },
};