// src/commands/giveaway/giveaway.js (修正後・完全版)

import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField } from 'discord.js';
import { getDBPool, get } from '../../lib/settingsCache.js';
import { parseDuration } from '../../lib/timeUtils.js';
import { hasGiveawayPermission } from '../../lib/permissionUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('抽選を管理します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addSubcommand(subcommand => subcommand.setName('start').setDescription('新しい抽選をすぐに開始します。').addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true)).addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('期間 (例: 10m, 1h, 2d)').setRequired(false)).addStringOption(option => option.setName('end_time').setDescription('終了日時 (例: 2025-07-22 21:00)').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('schedule').setDescription('未来の指定した日時に抽選を開始するよう予約します。').addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true)).addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true)).addStringOption(option => option.setName('start_time').setDescription('開始日時 (例: 2025-07-22 21:00)').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('期間 (例: 1h, 2d)').setRequired(false)).addStringOption(option => option.setName('end_time').setDescription('終了日時 (例: 2025-07-22 22:00)').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('end').setDescription('進行中の抽選をただちに終了します。').addStringOption(option => option.setName('message_id').setDescription('終了したい抽選のメッセージID').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('reroll').setDescription('終了した抽選の当選者を再抽選します。').addStringOption(option => option.setName('message_id').setDescription('再抽選したい抽選のメッセージID').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('list').setDescription('進行中および予約中の抽選の一覧を表示します。'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unschedule')
                .setDescription('予約された抽選を削除します。')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('削除したい予約抽選のID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('進行中または終了した抽選を完全に削除します。')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('削除したい抽選のメッセージID')
                        .setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('fix').setDescription('不具合のある抽選を、参加者を引き継いで作り直します。').addStringOption(option => option.setName('message_id').setDescription('不具合のある抽選のメッセージID').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('進行中の抽選の情報を編集します。')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('編集したい抽選のメッセージID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('新しい賞品')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('新しい当選者数')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('end_time')
                        .setDescription('新しい終了日時 (例: 2025-07-22 21:00)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('エラー状態になった抽選を、進行中に復元します。')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('復元したい抽選のメッセージID')
                        .setRequired(true))),
    async execute(interaction) {
        if (interaction.options.getSubcommand() !== 'list' && !(await hasGiveawayPermission(interaction))) {
            return interaction.reply({ content: 'このコマンドを実行する権限がありません。', flags: [MessageFlags.Ephemeral] });
        }

        const subcommand = interaction.options.getSubcommand();
        const pool = await getDBPool();

        if (subcommand === 'start') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const prize = interaction.options.getString('prize');
            const winnerCount = interaction.options.getInteger('winners');
            const durationStr = interaction.options.getString('duration');
            const endTimeStr = interaction.options.getString('end_time');
            const channel = interaction.channel;
            if (!durationStr && !endTimeStr) { return interaction.editReply('エラー: `duration`または`end_time`のどちらか一方を必ず指定してください。'); }
            if (durationStr && endTimeStr) { return interaction.editReply('エラー: `duration`と`end_time`を同時に指定することはできません。');}

            let endTime;
            if (durationStr) {
                const durationMs = parseDuration(durationStr);
                if (!durationMs) { return interaction.editReply('期間の形式が正しくありません。(例: 10m, 1h, 2d)'); }
                endTime = new Date(Date.now() + durationMs);
            } else {
                const date = new Date(endTimeStr.replace(/-/g, '/') + ' GMT+0900');
                if (isNaN(date.getTime()) || date <= new Date()) { return interaction.editReply('エラー: 終了日時は未来の正しい日時を指定してください。(例: 2025-07-22 21:00)');}
                endTime = date;
            }

            const giveawayEmbed = new EmbedBuilder()
                .setTitle(`🎉 景品: ${prize}`)
                .setDescription(`下のボタンを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`)
                .addFields(
                    { name: '当選者数', value: `${winnerCount}名`, inline: true },
                    { name: '参加者', value: '0名', inline: true },
                    { name: '主催者', value: `${interaction.user}`, inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp(endTime);

            const participateButton = new ButtonBuilder().setCustomId(`giveaway_participate:${interaction.guildId}:${channel.id}`).setLabel('参加する').setStyle(ButtonStyle.Primary);
            const row = new ActionRowBuilder().addComponents(participateButton);

            try {
                const message = await channel.send({ embeds: [giveawayEmbed], components: [row] });
                giveawayEmbed.setFooter({ text: `メッセージID: ${message.id}` });
                await message.edit({ embeds: [giveawayEmbed], components: [row] });

                const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                await pool.query(sql, [message.id, interaction.guildId, channel.id, prize, winnerCount, endTime]);

                await interaction.editReply({ content: `✅ 抽選を作成しました！` });
            } catch (error) {
                console.error('抽選開始に失敗:', error);
                await interaction.editReply({ content: '抽選の作成中にエラーが発生しました。' });
            }
        } else if (subcommand === 'schedule') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const prize = interaction.options.getString('prize');
            const winnerCount = interaction.options.getInteger('winners');
            const startTimeStr = interaction.options.getString('start_time');
            const channel = interaction.channel;
            const durationStr = interaction.options.getString('duration');
            const endTimeStr = interaction.options.getString('end_time');
            if (!durationStr && !endTimeStr) { return interaction.editReply('エラー: `duration`または`end_time`のどちらか一方を必ず指定してください。');}
            if (durationStr && endTimeStr) { return interaction.editReply('エラー: `duration`と`end_time`を同時に指定することはできません。');}
            const startTime = new Date(startTimeStr.replace(/-/g, '/') + ' GMT+0900');
            if (isNaN(startTime.getTime()) || startTime <= new Date()) { return interaction.editReply('エラー: 開始日時は未来の正しい日時を指定してください。');}
            let durationHours = null;
            let endTime = null;
            if (durationStr) {
                const durationMs = parseDuration(durationStr);
                if (!durationMs) { return interaction.editReply('エラー: 期間の形式が正しくありません。(例: 1h, 2d)');}
                durationHours = durationMs / (1000 * 60 * 60);
            } else {
                endTime = new Date(endTimeStr.replace(/-/g, '/') + ' GMT+0900');
                if (isNaN(endTime.getTime()) || endTime <= startTime) { return interaction.editReply('エラー: 終了日時は、開始日時より後の正しい日時を指定してください。');}
            }
            const sql = 'INSERT INTO scheduled_giveaways (guild_id, prize, winner_count, start_time, duration_hours, end_time, giveaway_channel_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *';
            await pool.query(sql, [interaction.guildId, prize, winnerCount, startTime, durationHours, endTime, channel.id]);
            await interaction.editReply(`✅ 抽選の予約が完了しました。\n**${startTime.toLocaleString('ja-JP')}** に、${channel} で **「${prize}」** の抽選が開始されます。`);
        }
        else if (subcommand === 'end') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const activeGiveaways = await get.activeGiveaways(interaction.guildId);
            const giveaway = activeGiveaways.find(g => g.message_id === messageId);
            if (!giveaway) { return interaction.editReply('エラー: 指定されたIDの進行中抽選が見つかりません。');}
            const newEndTime = new Date();
            await pool.query("UPDATE giveaways SET end_time = $1 WHERE message_id = $2", [newEndTime, messageId]);
            await interaction.editReply(`✅ 抽選「${giveaway.prize}」を終了しました。次の監視タイミング（最大1分後）に抽選が行われます。`);
        } else if (subcommand === 'reroll') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const result = await pool.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2 AND status = 'ENDED'", [messageId, interaction.guildId]);
            const giveaway = result.rows[0];
            if (!giveaway) { return interaction.editReply('エラー: 指定されたIDの終了済み抽選が見つかりません。');}
            try {
                const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
                const participants = giveaway.participants || [];

                if (participants.length < giveaway.winner_count) { return interaction.editReply('エラー: 当選者数より参加者が少ないため、再抽選できません。');}

                const shuffled = [...participants].sort(() => 0.5 - Math.random());
                const newWinnerIds = shuffled.slice(0, giveaway.winner_count);
                const newWinnerMentions = newWinnerIds.map(id => `<@${id}>`).join(' ');

                await channel.send({ embeds: [
                    new EmbedBuilder()
                        .setTitle(`🎉 景品: ${giveaway.prize} の再抽選結果！`)
                        .setDescription(`新しい当選者は ${newWinnerMentions} です！おめでとうございます🎉`)
                        .setColor(0x2ECC71)
                        .setTimestamp()
                ]});
                await pool.query("UPDATE giveaways SET winners = $1 WHERE message_id = $2", [newWinnerIds, messageId]);
                await interaction.editReply('✅ 新しい当選者を再抽選しました。');
            } catch (error) { console.error('再抽選の処理中にエラー:', error); await interaction.editReply('再抽選の処理中にエラーが発生しました。'); }
        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const activeGiveaways = await get.activeGiveaways(interaction.guildId);
            const scheduledGiveaways = await get.scheduledGiveaways(interaction.guildId);

            if (activeGiveaways.length === 0 && scheduledGiveaways.length === 0) {
                return interaction.editReply('現在、このサーバーで進行中または予約中の抽選はありません。');
            }

            const embed = new EmbedBuilder()
                .setTitle('🎁 抽選一覧')
                .setColor(0x5865F2);

            if (activeGiveaways.length > 0) {
                let fields = [];
                let currentDescription = '';
                for (const g of activeGiveaways) {
                    const entry = `**${g.prize}**\n- [メッセージに飛ぶ](https://discord.com/channels/${g.guild_id}/${g.channel_id}/${g.message_id})\n- 終了日時: <t:${Math.floor(new Date(g.end_time).getTime() / 1000)}:F>\n\n`;
                    if (currentDescription.length + entry.length > 1024) {
                        fields.push({ name: '🚀 進行中の抽選', value: currentDescription, inline: false });
                        currentDescription = '';
                    }
                    currentDescription += entry;
                }
                if (currentDescription) {
                    fields.push({ name: '🚀 進行中の抽選', value: currentDescription, inline: false });
                }
                if (fields.length > 0) embed.addFields(fields);
            }

            if (scheduledGiveaways.length > 0) {
                let scheduledDescription = '';
                for (const s of scheduledGiveaways.slice(0, 10)) {
                    scheduledDescription += `**${s.prize}** (ID: \`${s.id}\`)\n- 当選者数: ${s.winner_count}名\n- 開始日時: <t:${Math.floor(new Date(s.start_time).getTime() / 1000)}:F>\n- チャンネル: <#${s.giveaway_channel_id}>\n\n`;
                }
                embed.addFields({ name: '⏰ 予約中の抽選', value: scheduledDescription || 'なし', inline: false });
            }

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'restore') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');

            try {
                const { rows } = await pool.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2 AND status = 'ERRORED'", [messageId, interaction.guildId]);
                if (rows.length === 0) {
                    return interaction.editReply('エラー: 指定されたIDのエラー状態の抽選が見つかりませんでした。');
                }

                await pool.query("UPDATE giveaways SET status = 'RUNNING' WHERE message_id = $1", [messageId]);

                await interaction.editReply(`✅ 抽選 (ID: \`${messageId}\`) を進行中に復元しました。`);
            } catch (error) {
                console.error('Giveaway restore failed:', error);
                await interaction.editReply('抽選の復元中にエラーが発生しました。');
            }
        } else if (subcommand === 'unschedule') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const scheduledId = interaction.options.getInteger('id');

            try {
                const result = await pool.query('DELETE FROM scheduled_giveaways WHERE id = $1 AND guild_id = $2', [scheduledId, interaction.guildId]);
                if (result.rowCount > 0) {
                    await interaction.editReply(`✅ 予約抽選 (ID: \`${scheduledId}\`) を削除しました。`);
                } else {
                    await interaction.editReply('エラー: 指定されたIDの予約抽選が見つかりませんでした。');
                }
            } catch (error) {
                console.error('予約抽選の解除に失敗:', error);
                await interaction.editReply('予約抽選の削除中にエラーが発生しました。');
            }
        } else if (subcommand === 'delete') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const giveawayResult = await pool.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2", [messageId, interaction.guildId]);
            const giveaway = giveawayResult.rows[0];

            if (!giveaway) {
                return interaction.editReply('エラー: 指定されたIDの抽選が見つかりませんでした。');
            }

            try {
                const channel = await interaction.client.channels.fetch(giveaway.channel_id);
                const message = await channel.messages.fetch(messageId);
                await message.delete();
            } catch (error) {
                console.log(`Giveaway message ${messageId} could not be deleted (may already be gone):`, error.message);
            }

            const deleteResult = await pool.query('DELETE FROM giveaways WHERE message_id = $1', [messageId]);

            if (deleteResult.rowCount > 0) {
                await interaction.editReply(`✅ 抽選「${giveaway.prize}」(ID: \`${messageId}\`) を完全に削除しました。`);
            } else {
                await interaction.editReply('データベースからの削除中にエラーが発生しました。');
            }
        } else if (subcommand === 'fix') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const giveawayResult = await pool.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2", [messageId, interaction.guildId]);
            const giveaway = giveawayResult.rows[0];

            if (!giveaway) {
                return interaction.editReply('エラー: 指定されたIDの抽選が見つかりません。');
            }

            if (giveaway.status !== 'RUNNING') {
                 return interaction.editReply('エラー: この抽選は進行中ではありません。修復できるのは進行中の抽選のみです。');
            }

            try {
                const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
                const oldMessage = await channel.messages.fetch(messageId);

                const validParticipantIds = giveaway.participants || [];

                await oldMessage.edit({ content: '⚠️ **この抽選は不具合のため、新しいメッセージに移動しました。**', embeds: [], components: [] });
                await pool.query("UPDATE giveaways SET status = 'CANCELLED' WHERE message_id = $1", [messageId]);

                let finalEndTime = new Date(giveaway.end_time);
                if (isNaN(finalEndTime.getTime())) {
                    finalEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
                }

                const newEmbed = new EmbedBuilder()
                    .setTitle(`🎉 景品: ${giveaway.prize}`)
                    .setDescription(`下のボタンを押して参加しよう！\n**終了日時: <t:${Math.floor(finalEndTime.getTime() / 1000)}:F>**`)
                    .setColor(0x5865F2)
                    .setTimestamp(finalEndTime)
                    .addFields(
                        { name: '当選者数', value: `${giveaway.winner_count}名`, inline: true },
                        { name: '参加者', value: `${validParticipantIds.length}名`, inline: true },
                        { name: '主催者', value: oldMessage.embeds[0]?.fields?.[2]?.value || `${interaction.user}` }
                    );

                const newButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
                const newRow = new ActionRowBuilder().addComponents(newButton);

                const newMessage = await channel.send({ content: '🔧 **抽選を再作成しました！** 🔧', embeds: [newEmbed], components: [newRow] });

                newEmbed.setFooter({ text: `メッセージID: ${newMessage.id}` });
                await newMessage.edit({ embeds: [newEmbed], components: [newRow] });

                const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time, participants) VALUES ($1, $2, $3, $4, $5, $6, $7)';
                await pool.query(sql, [newMessage.id, giveaway.guild_id, giveaway.channel_id, giveaway.prize, giveaway.winner_count, finalEndTime, validParticipantIds]);

                await interaction.editReply(`✅ 抽選を作り直しました！`);
            } catch (error) {
                console.error('抽選の修復中にエラー:', error);
                await interaction.editReply('抽選の修復中にエラーが発生しました。管理者にお問い合わせください。');
            }
        } else if (subcommand === 'edit') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const newPrize = interaction.options.getString('prize');
            const newWinnerCount = interaction.options.getInteger('winners');
            const newEndTimeStr = interaction.options.getString('end_time');

            const giveawayResult = await pool.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2 AND status = 'RUNNING'", [messageId, interaction.guildId]);
            const giveaway = giveawayResult.rows[0];

            if (!giveaway) {
                return interaction.editReply('エラー: 指定されたIDの進行中抽選が見つからないか、既に終了しています。');
            }

            let updateFields = [];
            let updateValues = [];
            let paramIndex = 1;

            if (newPrize) {
                updateFields.push(`prize = $${paramIndex++}`);
                updateValues.push(newPrize);
            }
            if (newWinnerCount !== null) {
                updateFields.push(`winner_count = $${paramIndex++}`);
                updateValues.push(newWinnerCount);
            }
            if (newEndTimeStr) {
                const newTime = new Date(newEndTimeStr.replace(/-/g, '/') + ' GMT+0900');
                if (isNaN(newTime.getTime()) || newTime <= new Date()) {
                    return interaction.editReply('エラー: 新しい終了日時は未来の正しい日時を指定してください。(例: 2025-07-22 21:00)');
                }
                updateFields.push(`end_time = $${paramIndex++}`);
                updateValues.push(newTime);
            }

            if (updateFields.length === 0) {
                return interaction.editReply('エラー: 更新する情報が指定されていません。');
            }

            const updateSql = `UPDATE giveaways SET ${updateFields.join(', ')} WHERE message_id = $${paramIndex} RETURNING *`;
            updateValues.push(messageId);
            const updatedResult = await pool.query(updateSql, updateValues);
            const updatedGiveaway = updatedResult.rows[0];

            try {
                const channel = await interaction.guild.channels.fetch(updatedGiveaway.channel_id);
                const message = await channel.messages.fetch(messageId);
                const currentParticipantsCount = updatedGiveaway.participants ? updatedGiveaway.participants.length : 0;

                const updatedEmbed = EmbedBuilder.from(message.embeds[0])
                    .setTitle(`🎉 景品: ${updatedGiveaway.prize}`)
                    .setDescription(`下のボタンを押して参加しよう！\n**終了日時: <t:${Math.floor(new Date(updatedGiveaway.end_time).getTime() / 1000)}:F>**`)
                    .setFields(
                        { name: '当選者数', value: `${updatedGiveaway.winner_count}名`, inline: true },
                        { name: '参加者', value: `${currentParticipantsCount}名`, inline: true },
                        { name: '主催者', value: message.embeds[0].fields[2].value }
                    )
                    .setTimestamp(new Date(updatedGiveaway.end_time));

                updatedEmbed.setFooter({ text: `メッセージID: ${message.id}` });
                await message.edit({ embeds: [updatedEmbed] });
                await interaction.editReply(`✅ 抽選 (ID: \`${messageId}\`) の情報を更新しました。`);
            } catch (error) {
                console.error('抽選メッセージの編集に失敗:', error);
                await interaction.editReply('抽選情報の更新中にエラーが発生しましたが、データベースは更新されました。メッセージの表示更新に失敗しました。');
            }
        }
    },
};