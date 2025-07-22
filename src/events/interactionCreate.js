import { Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, EmbedBuilder } from 'discord.js';
import { logCommandError } from '../lib/logger.js';
import { getDBPool, updateGiveaway, getAllScheduledGiveaways } from '../lib/settingsCache.js';
import { hasGiveawayPermission } from '../lib/permissionUtils.js';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.inGuild()) return;

        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) { console.error(`No command matching ${interaction.commandName} was found.`); await interaction.reply({ content: '存在しないコマンドです。', flags: [MessageFlags.Ephemeral] }); return; }
            const { cooldowns } = interaction.client;
            if (!cooldowns.has(command.data.name)) { cooldowns.set(command.data.name, new Collection()); }
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
                if (interaction.replied || interaction.deferred) { await interaction.followUp({ content: errorMessage, flags: [MessageFlags.Ephemeral] }); }
                else { await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] }); }
            }
        } 
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('giveaway_participate')) {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const pool = await getDBPool();
                const result = await pool.query("SELECT prize, participants, winner_count FROM giveaways WHERE message_id = $1 AND status = 'RUNNING'", [interaction.message.id]);
                const giveaway = result.rows[0];

                if (!giveaway) return interaction.editReply('このGiveawayは終了またはキャンセルされました。');

                const participants = new Set(giveaway.participants || []);
                let newParticipantsArray;
                
                const currentHostValue = interaction.message.embeds[0]?.fields?.[2]?.value || `ボット(${interaction.client.user.username})`; 
                
                if (participants.has(interaction.user.id)) {
                    participants.delete(interaction.user.id);
                    newParticipantsArray = Array.from(participants);
                    await pool.query("UPDATE giveaways SET participants = $1 WHERE message_id = $2", [newParticipantsArray, interaction.message.id]);
                    updateGiveaway(interaction.guildId, interaction.message.id, { participants: newParticipantsArray });
                    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFields({ name: '当選者数', value: `${giveaway.winner_count}名`, inline: true }, { name: '参加者', value: `${participants.size}名`, inline: true }, { name: '主催者', value: currentHostValue });
                    await interaction.message.edit({ embeds: [newEmbed] });
                    await interaction.editReply('✅ 参加を取り消しました。');
                } else {
                    participants.add(interaction.user.id);
                    newParticipantsArray = Array.from(participants);
                    await pool.query("UPDATE giveaways SET participants = $1 WHERE message_id = $2", [newParticipantsArray, interaction.message.id]);
                    updateGiveaway(interaction.guildId, interaction.message.id, { participants: newParticipantsArray });
                    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFields({ name: '当選者数', value: `${giveaway.winner_count}名`, inline: true }, { name: '参加者', value: `${participants.size}名`, inline: true }, { name: '主催者', value: currentHostValue });
                    await interaction.message.edit({ embeds: [newEmbed] });
                    await interaction.editReply('✅ 抽選に参加しました！');
                }
                return;
            }

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
                    if (interaction.deferred || interaction.replied) { await interaction.editReply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。' }); }
                    else { await interaction.reply({ content: '集計対象のメッセージが見つからないか、エラーが発生しました。', flags: [MessageFlags.Ephemeral] }); }
                }
            }
        }
    },
};