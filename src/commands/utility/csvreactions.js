import { SlashCommandBuilder } from 'discord.js';
import { ReactionExporter } from '../../lib/reactionExporter.js';

export default {
    data: new SlashCommandBuilder()
        .setName('csvreactions')
        .setDescription('指定メッセージのリアクションをCSVで集計します。')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('リアクションを集計したいメッセージのID')
                .setRequired(true)),
    async execute(interaction) {
        const messageId = interaction.options.getString('message_id');
        
        try {
            const message = await interaction.channel.messages.fetch(messageId);
            const exporter = new ReactionExporter(interaction.client, message);
            // The exporter class handles the reply
            await exporter.execute(interaction);
        } catch (error) {
            console.error('CSV export command failed:', error);
            await interaction.reply({ content: '指定されたメッセージIDが見つからないか、エラーが発生しました。', ephemeral: true });
        }
    },
};