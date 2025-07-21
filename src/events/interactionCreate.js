import { Events, MessageFlags } from 'discord.js';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                await interaction.reply({ content: '存在しないコマンドです。', flags: [MessageFlags.Ephemeral] });
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                const errorMessage = 'コマンドの実行中にエラーが発生しました！';
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                }
            }
        }
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('csvreactions_')) {
                const messageId = interaction.customId.split('_')[1];
                 try {
                    const message = await interaction.channel.messages.fetch(messageId);
                    const { ReactionExporter } = await import('../lib/reactionExporter.js');
                    const exporter = new ReactionExporter(interaction.client, message);
                    await exporter.execute(interaction);
                } catch (error) {
                    console.error('Button interaction for CSV export failed:', error);
                    await interaction.reply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。', flags: [MessageFlags.Ephemeral] });
                }
            }
        }
    },
};