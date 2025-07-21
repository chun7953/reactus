import { Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- チャットコマンドの処理 (変更なし) ---
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
        // --- ボタン処理 (ここからが修正部分) ---
        else if (interaction.isButton()) {
            // "集計結果を生成" ボタンが押された場合
            if (interaction.customId.startsWith('csvreactions_')) {
                const messageId = interaction.customId.split('_')[1];
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`csv_public_${messageId}`)
                            .setLabel('全員に公開')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`csv_ephemeral_${messageId}`)
                            .setLabel('自分のみに表示')
                            .setStyle(ButtonStyle.Primary)
                    );

                await interaction.reply({
                    content: '集計結果の表示方法を選んでください。',
                    components: [row],
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            const isPublic = interaction.customId.startsWith('csv_public_');
            const isEphemeral = interaction.customId.startsWith('csv_ephemeral_');

            // "全員に公開" or "自分のみに表示" ボタンが押された場合
            if (isPublic || isEphemeral) {
                 const messageId = interaction.customId.split('_')[2];
                 try {
                    const message = await interaction.channel.messages.fetch(messageId);
                    const { ReactionExporter } = await import('../lib/reactionExporter.js');
                    const exporter = new ReactionExporter(interaction.client, message);
                    await exporter.execute(interaction, isPublic); // isPublicがtrueかfalseかを渡す
                } catch (error) {
                    console.error('Button interaction for CSV export failed:', error);
                    // deferReplyされている可能性があるのでeditReplyで返信
                    if (interaction.deferred) {
                        await interaction.editReply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。' });
                    } else {
                        await interaction.reply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。', flags: [MessageFlags.Ephemeral] });
                    }
                }
            }
        }
    },
};