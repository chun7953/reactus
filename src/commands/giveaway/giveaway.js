import { SlashCommandBuilder, MessageFlags, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField, Collection } from 'discord.js';
import { cacheDB, getActiveGiveaways } from '../../lib/settingsCache.js';
import { parseDuration } from '../../lib/timeUtils.js';
import { hasGiveawayPermission } from '../../lib/permissionUtils.js';
// import cron from 'node-cron'; // 定期抽選コマンド削除に伴い、この行を削除

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway（抽選）を管理します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addSubcommand(subcommand => subcommand.setName('start').setDescription('新しいGiveawayをすぐに開始します。').addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true)).addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('期間 (例: 10m, 1h, 2d)').setRequired(false)).addStringOption(option => option.setName('end_time').setDescription('終了日時 (例: 2025-07-22 21:00)').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('schedule').setDescription('未来の指定した日時にGiveawayを開始するよう予約します。').addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true)).addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true)).addStringOption(option => option.setName('start_time').setDescription('開始日時 (例: 2025-07-22 21:00)').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('期間 (例: 1h, 2d)').setRequired(false)).addStringOption(option => option.setName('end_time').setDescription('終了日時 (例: 2025-07-22 22:00)').setRequired(false)))
        // .addSubcommand(subcommand => subcommand.setName('recurring').setDescription('定期的なGiveawayを設定します。').addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true)).addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true)).addStringOption(option => option.setName('schedule').setDescription('スケジュール (cron形式: 分 時 日 月 週)').setRequired(true)).addStringOption(option => option.setName('duration').setDescription('期間 (例: 1h, 2d)').setRequired(true)).addChannelOption(option => option.setName('giveaway_channel').setDescription('抽選を投稿するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(false)).addChannelOption(option => option.setName('confirmation_channel').setDescription('開催確認を投稿するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(false)).addRoleOption(option => option.setName('confirmation_role').setDescription('開催を確認するロール').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('end').setDescription('進行中のGiveawayをただちに終了します。').addStringOption(option => option.setName('message_id').setDescription('終了したいGiveawayのメッセージID').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('reroll').setDescription('終了したGiveawayの当選者を再抽選します。').addStringOption(option => option.setName('message_id').setDescription('再抽選したいGiveawayのメッセージID').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('list').setDescription('進行中のGiveawayの一覧を表示します。'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unschedule') // 新しいサブコマンドを追加
                .setDescription('予約されたGiveawayまたは定期抽選を削除します。')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('削除したい予約/定期抽選のID')
                        .setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('fix').setDescription('不具合のあるGiveawayを、参加者を引き継いで作り直します。').addStringOption(option => option.setName('message_id').setDescription('不具合のあるGiveawayのメッセージID').setRequired(true)))
        .addSubcommand(subcommand => // Add new subcommand for editing
            subcommand
                .setName('edit')
                .setDescription('進行中のGiveawayの情報を編集します。')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('編集したいGiveawayのメッセージID')
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
                        .setRequired(false))),
    async execute(interaction) {
        if (!interaction.inGuild()) return;
        if (!hasGiveawayPermission(interaction)) {
            return interaction.reply({ content: 'このコマンドを実行する権限がありません。', flags: [MessageFlags.Ephemeral] });
        }
        
        const subcommand = interaction.options.getSubcommand();

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

            const createGiveaway = async (finalEndTime) => {
             const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway: ${prize}`).setDescription(`下のボタンを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`).addFields({ name: '当選者数', value: `${winnerCount}名`, inline: true }, { name: '参加者', value: '0名', inline: true }, { name: '主催者', value: `${interaction.user}`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
            const participateButton = new ButtonBuilder().setCustomId(`giveaway_participate:${interaction.guildId}:${channel.id}`).setLabel('参加する').setStyle(ButtonStyle.Primary);                const row = new ActionRowBuilder().addComponents(participateButton);
                try {
                    const message = await channel.send({ embeds: [giveawayEmbed], components: [row] });
                    const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                    await cacheDB.query(sql, [message.id, interaction.guildId, channel.id, prize, winnerCount, finalEndTime]);
                    await interaction.editReply({ content: `✅ Giveawayを ${channel} に作成しました！`, components: [] });
                } catch (error) {
                    console.error('Failed to start giveaway:', error);
                    await interaction.editReply({ content: 'Giveawayの作成中にエラーが発生しました。', components: [] });
                }
            };

            if (endTime.getMinutes() % 10 !== 0 || endTime.getSeconds() !== 0 || endTime.getMilliseconds() !== 0) {
                const roundedEndTime = new Date(endTime);
                const minutes = roundedEndTime.getMinutes();
                const roundedMinutes = (Math.floor(minutes / 10) + 1) * 10;
                roundedEndTime.setMinutes(roundedMinutes, 0, 0);

                const jstTimeOptions = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' };
                const roundedTimeString = roundedEndTime.toLocaleTimeString('ja-JP', jstTimeOptions);

                const confirmationButton = new ButtonBuilder().setCustomId('confirm_giveaway_time').setLabel('はい').setStyle(ButtonStyle.Primary);
                const cancelButton = new ButtonBuilder().setCustomId('cancel_giveaway_time').setLabel('いいえ').setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(confirmationButton, cancelButton);
                
                const reply = await interaction.editReply({
                    content: `Reactusの仕様上、抽選結果は **${roundedTimeString}** に出ますがよろしいですか？`,
                    components: [row],
                    fetchReply: true,
                });
                
                try {
                    const collectorFilter = i => i.user.id === interaction.user.id;
                    const confirmation = await reply.awaitMessageComponent({ filter: collectorFilter, time: 60_000 });
                    if (confirmation.customId === 'cancel_giveaway_time') {
                        return confirmation.update({ content: 'キャンセルしました。', components: [] });
                    }
                    await confirmation.update({ content: '✅ Giveawayを作成します...', components: [] });
                    await createGiveaway(endTime);
                } catch (e) {
                    return interaction.editReply({ content: '60秒以内に応答がなかったため、キャンセルしました。', components: [] });
                }
            } else {
                await createGiveaway(endTime);
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
            const sql = 'INSERT INTO scheduled_giveaways (guild_id, prize, winner_count, start_time, duration_hours, end_time, giveaway_channel_id) VALUES ($1, $2, $3, $4, $5, $6, $7)';
            await cacheDB.query(sql, [interaction.guildId, prize, winnerCount, startTime, durationHours, endTime, channel.id]);
            await interaction.editReply(`✅ 抽選の予約が完了しました。\n**${startTime.toLocaleString('ja-JP')}** に、${channel} で **「${prize}」** の抽選が開始されます。`);
        } 
        else if (subcommand === 'end') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const giveaway = getActiveGiveaways(interaction.guildId).find(g => g.message_id === messageId);
            if (!giveaway) { return interaction.editReply('エラー: 指定されたIDの進行中Giveawayが見つかりません。');}
            await cacheDB.query("UPDATE giveaways SET end_time = NOW() WHERE message_id = $1", [messageId]);
            await interaction.editReply(`✅ Giveaway「${giveaway.prize}」を終了しました。次の監視タイミング（最大10分後）に抽選が行われます。`);
        } else if (subcommand === 'reroll') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const result = await cacheDB.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2 AND status = 'ENDED'", [messageId, interaction.guildId]);
            const giveaway = result.rows[0];
            if (!giveaway) { return interaction.editReply('エラー: 指定されたIDの終了済みGiveawayが見つかりません。');}
            try {
                const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
                const message = await channel.messages.fetch(giveaway.message_id);
                const reaction = message.reactions.cache.get('🎉');
                // reactionがnullの場合にCollectionを返すように修正
                const participants = reaction ? await reaction.users.fetch() : new Collection(); 
                const validParticipants = participants.filter(user => !user.bot);
                if (validParticipants.size < giveaway.winner_count) { return interaction.editReply('エラー: 当選者数より参加者が少ないため、再抽選できません。');}
                const winnerUsers = validParticipants.random(giveaway.winner_count);
                const newWinners = winnerUsers.map(user => user.id);
                const newWinnerMentions = newWinners.map(id => `<@${id}>`).join(' ');
                await channel.send(`** reroll! **\n新しい当選者は ${newWinnerMentions} です！おめでとうございます🎉`);
                await cacheDB.query("UPDATE giveaways SET winners = $1 WHERE message_id = $2", [newWinners, messageId]);
                await interaction.editReply('✅ 新しい当選者を再抽選しました。');
            } catch (error) { console.error('Failed to reroll giveaway:', error); await interaction.editReply('再抽選の処理中にエラーが発生しました。'); }
        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const giveaways = getActiveGiveaways(interaction.guildId);
            if (giveaways.length === 0) { return interaction.editReply('現在、このサーバーで進行中のGiveawayはありません。');}
            const embed = new EmbedBuilder().setTitle('🎁 進行中のGiveaway一覧').setColor(0x5865F2);
            for (const g of giveaways.slice(0, 25)) {
                embed.addFields({ name: g.prize, value: `[メッセージに飛ぶ](https://discord.com/channels/${g.guild_id}/${g.channel_id}/${g.message_id})\n終了日時: <t:${Math.floor(new Date(g.end_time).getTime() / 1000)}:F>` });
            }
            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'unschedule') { // 新しいサブコマンドのロジック
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const scheduledId = interaction.options.getInteger('id');

            try {
                const result = await cacheDB.query('DELETE FROM scheduled_giveaways WHERE id = $1 AND guild_id = $2', [scheduledId, interaction.guildId]);
                if (result.rowCount > 0) {
                    await interaction.editReply(`✅ 予約/定期抽選 (ID: \`${scheduledId}\`) を削除しました。`);
                } else {
                    await interaction.editReply('エラー: 指定されたIDの予約/定期抽選が見つかりませんでした。');
                }
            } catch (error) {
                console.error('Failed to unschedule giveaway:', error);
                await interaction.editReply('予約/定期抽選の削除中にエラーが発生しました。');
            }
        }
        else if (subcommand === 'fix') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const giveaway = getActiveGiveaways(interaction.guildId).find(g => g.message_id === messageId);
            if (!giveaway) { return interaction.editReply('エラー: 指定されたIDの進行中Giveawayが見つかりません。'); }
            try {
                const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
                const oldMessage = await channel.messages.fetch(messageId);
                const reaction = oldMessage.reactions.cache.get('🎉');
                const participants = reaction ? await reaction.users.fetch() : new Map();
                const validParticipantIds = Array.from(participants.filter(u => !u.bot).keys());
                
                await oldMessage.edit({ content: '⚠️ **この抽選は不具合のため、新しいメッセージに移動しました。**', embeds: [], components: [] });
                await cacheDB.query("UPDATE giveaways SET status = 'CANCELLED' WHERE message_id = $1", [messageId]);

                const newEmbed = EmbedBuilder.from(oldMessage.embeds[0]);
                const newButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
                const newRow = new ActionRowBuilder().addComponents(newButton);
                
                const newMessage = await channel.send({ content: '🔧 **抽選を再作成しました！** 🔧', embeds: [newEmbed], components: [newRow] });
                
                const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                await cacheDB.query(sql, [newMessage.id, giveaway.guild_id, giveaway.channel_id, giveaway.prize, giveaway.winner_count, new Date(giveaway.end_time)]);
                
                for (const userId of validParticipantIds) {
                    await newMessage.react('🎉').catch(e => console.error(`Failed to re-react for user ${userId}:`, e));
                }
                
                await interaction.editReply(`✅ 抽選を作り直しました。${validParticipantIds.length}名の参加者を引き継いでいます。`);
            } catch (error) { console.error('Failed to fix giveaway:', error); await interaction.editReply('抽選の修復中にエラーが発生しました。'); }
        } else if (subcommand === 'edit') { // New subcommand logic for editing
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const messageId = interaction.options.getString('message_id');
            const newPrize = interaction.options.getString('prize');
            const newWinnerCount = interaction.options.getInteger('winners');
            const newEndTimeStr = interaction.options.getString('end_time');

            const giveawayResult = await cacheDB.query("SELECT * FROM giveaways WHERE message_id = $1 AND guild_id = $2 AND status = 'RUNNING'", [messageId, interaction.guildId]);
            const giveaway = giveawayResult.rows[0];

            if (!giveaway) {
                return interaction.editReply('エラー: 指定されたIDの進行中Giveawayが見つからないか、既に終了しています。');
            }

            let updateFields = [];
            let updateValues = [];
            let paramIndex = 1;

            if (newPrize) {
                updateFields.push(`prize = $${paramIndex++}`);
                updateValues.push(newPrize);
            }
            if (newWinnerCount !== null) { // Check for null explicitly as 0 is a valid value
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

            const updateSql = `UPDATE giveaways SET ${updateFields.join(', ')} WHERE message_id = $${paramIndex}`;
            updateValues.push(messageId);

            await cacheDB.query(updateSql, updateValues);

            // Fetch the updated giveaway to construct the embed
            const updatedGiveawayResult = await cacheDB.query("SELECT * FROM giveaways WHERE message_id = $1", [messageId]);
            const updatedGiveaway = updatedGiveawayResult.rows[0];

            try {
                const channel = await interaction.guild.channels.fetch(updatedGiveaway.channel_id);
                const message = await channel.messages.fetch(messageId);

                const currentParticipantsCount = updatedGiveaway.participants ? updatedGiveaway.participants.length : 0;
                
                const updatedEmbed = EmbedBuilder.from(message.embeds[0])
                    .setTitle(`🎉 Giveaway: ${updatedGiveaway.prize}`)
                    .setDescription(`下のボタンを押して参加しよう！\n**終了日時: <t:${Math.floor(new Date(updatedGiveaway.end_time).getTime() / 1000)}:F>**`)
                    .setFields(
                        { name: '当選者数', value: `${updatedGiveaway.winner_count}名`, inline: true },
                        { name: '参加者', value: `${currentParticipantsCount}名`, inline: true },
                        { name: '主催者', value: message.embeds[0].fields[2].value } // Keep original host
                    )
                    .setTimestamp(new Date(updatedGiveaway.end_time));

                await message.edit({ embeds: [updatedEmbed] });
                await interaction.editReply(`✅ Giveaway (ID: \`${messageId}\`) の情報を更新しました。`);
            } catch (error) {
                console.error('Failed to edit giveaway message:', error);
                await interaction.editReply('Giveaway情報の更新中にエラーが発生しましたが、データベースは更新されました。メッセージの表示更新に失敗しました。');
            }
        }
    },
};