import { Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } from 'discord.js';
import { logCommandError } from '../lib/logger.js'; // ★ 追記

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

        // --- チャットコマンドの処理 ---
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                await interaction.reply({ content: '存在しないコマンドです。', flags: [MessageFlags.Ephemeral] });
                return;
            }

            // ★★★ ここからクールダウン処理 (次のセクションで解説) ★★★
            const { cooldowns } = interaction.client;
            if (!cooldowns.has(command.data.name)) {
                cooldowns.set(command.data.name, new Collection());
            }
            const now = Date.now();
            const timestamps = cooldowns.get(command.data.name);
            const defaultCooldownDuration = 3;
            const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
                if (now < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1000);
                    return interaction.reply({
                        content: `このコマンドを再度使用するには、<t:${expiredTimestamp}:R>までお待ちください。`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }
            }
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
            // ★★★ クールダウン処理ここまで ★★★

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                // ★★★ エラーをWebhookに送信 ★★★
                logCommandError(interaction, error);
                const errorMessage = 'コマンドの実行中にエラーが発生しました！';
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                }
            }
        }
        else if (interaction.isButton()) {
            // ★★★ ここからが追記部分です ★★★
            if (interaction.customId === 'giveaway_participate') {
                await interaction.message.react('🎉').catch(() => {}); // 参加者の代わりにリアクションを押す
                await interaction.reply({ content: '✅ 抽選に参加しました！', flags: [MessageFlags.Ephemeral] });
                return;
            }
            // ★★★ ここまでが追記部分です ★★★
            
            // CSV集計ボタンの処理 (変更なし)
            if (interaction.customId.startsWith('csvreactions_')) {
                const messageId = interaction.customId.split('_')[1];
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId(`csv_public_${messageId}`).setLabel('全員に公開').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`csv_ephemeral_${messageId}`).setLabel('自分のみに表示').setStyle(ButtonStyle.Primary)
                    );
                await interaction.reply({ content: '集計結果の表示方法を選んでください。', components: [row], flags: [MessageFlags.Ephemeral] });
                return;
            }
            const isPublic = interaction.customId.startsWith('csv_public_');
            const isEphemeral = interaction.customId.startsWith('csv_ephemeral_');
            if (isPublic || isEphemeral) {
                 const messageId = interaction.customId.split('_')[2];
                 try {
                    const message = await interaction.channel.messages.fetch(messageId);
                    const { ReactionExporter } = await import('../lib/reactionExporter.js');
                    const exporter = new ReactionExporter(interaction.client, message);
                    await exporter.execute(interaction, isPublic);
                } catch (error) {
                    console.error('Button interaction for CSV export failed:', error);
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