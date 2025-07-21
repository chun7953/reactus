import { Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, EmbedBuilder } from 'discord.js';
import { logCommandError } from '../lib/logger.js';
import { getAllScheduledGiveaways, cacheDB, getGuildConfig } from '../lib/settingsCache.js';
import { hasGiveawayPermission } from '../lib/permissionUtils.js';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.inGuild()) return;

        // --- チャットコマンドの処理 ---
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                await interaction.reply({ content: '存在しないコマンドです。', flags: [MessageFlags.Ephemeral] });
                return;
            }

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
                    return interaction.reply({ content: `このコマンドを再度使用するには、<t:${expiredTimestamp}:R>までお待ちください。`, flags: [MessageFlags.Ephemeral] });
                }
            }
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                logCommandError(interaction, error);
                const errorMessage = 'コマンドの実行中にエラーが発生しました！';
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                }
            }
        } 
        // --- ボタン処理 ---
        else if (interaction.isButton()) {
            // Giveaway参加ボタン
            if (interaction.customId === 'giveaway_participate') {
                const reaction = interaction.message.reactions.cache.get('🎉');
                const users = reaction ? await reaction.users.fetch() : new Map();
                if (users.has(interaction.user.id)) {
                    await interaction.reply({ content: '⚠️すでに応募済みです！', flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.message.react('🎉').catch(() => {});
                    await interaction.reply({ content: '✅ 抽選に参加しました！', flags: [MessageFlags.Ephemeral] });
                }
                return;
            }

            // 定期Giveawayの承認ボタン
            if (interaction.customId.startsWith('giveaway_confirm_start_')) {
                const scheduledId = parseInt(interaction.customId.split('_')[3], 10);
                const scheduled = getAllScheduledGiveaways().find(g => g.id === scheduledId);
                if (!scheduled) {
                    return interaction.update({ content: 'この承認依頼は既に対応済みか、見つかりませんでした。', embeds: [], components: [] });
                }
                if (!interaction.member.roles.cache.has(scheduled.confirmation_role_id)) {
                    return interaction.reply({ content: '⚠️ このボタンを操作する権限がありません。', flags: [MessageFlags.Ephemeral] });
                }
                try {
                    const giveawayChannel = await interaction.client.channels.fetch(scheduled.giveaway_channel_id);
                    const endTime = new Date(Date.now() + scheduled.duration_hours * 60 * 60 * 1000);
                    const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway: ${scheduled.prize}`).setDescription(`リアクションを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`).addFields({ name: '当選者数', value: `${scheduled.winner_count}名`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
                    const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
                    const row = new ActionRowBuilder().addComponents(participateButton);
                    const message = await giveawayChannel.send({ embeds: [giveawayEmbed], components: [row] });
                    const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                    await cacheDB.query(sql, [message.id, scheduled.guild_id, giveawayChannel.id, scheduled.prize, scheduled.winner_count, endTime]);
                    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x2ECC71).setFooter({text: `承認者: ${interaction.user.username}`});
                    await interaction.update({ content: `✅ **${interaction.user.username}** が承認しました。${giveawayChannel}で抽選を開始します。`, embeds: [originalEmbed], components: [] });
                } catch(e) { 
                    console.error(e); 
                    await interaction.update({ content: '抽選の開始に失敗しました。', embeds: [], components: [] }); 
                }
                return;
            }

            // 定期Giveawayのスキップボタン
            if (interaction.customId.startsWith('giveaway_confirm_skip_')) {
                const scheduledId = parseInt(interaction.customId.split('_')[3], 10);
                const scheduled = getAllScheduledGiveaways().find(g => g.id === scheduledId);
                if (!scheduled) {
                    return interaction.update({ content: 'この承認依頼は既に対応済みか、見つかりませんでした。', embeds: [], components: [] });
                }
                if (!interaction.member.roles.cache.has(scheduled.confirmation_role_id)) {
                    return interaction.reply({ content: '⚠️ このボタンを操作する権限がありません。', flags: [MessageFlags.Ephemeral] });
                }
                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x95A5A6).setFooter({text: `スキップした人: ${interaction.user.username}`});
                await interaction.update({ content: `❌ **${interaction.user.username}** が今回の抽選をスキップしました。`, embeds: [originalEmbed], components: [] });
                return;
            }

            // CSV集計ボタン
            if (interaction.customId.startsWith('csvreactions_')) {
                const messageId = interaction.customId.split('_')[1];
                const row = new ActionRowBuilder().addComponents(
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
                    if (interaction.deferred) { await interaction.editReply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。' }); }
                    else { await interaction.reply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。', flags: [MessageFlags.Ephemeral] }); }
                }
            }
        }
    },
};