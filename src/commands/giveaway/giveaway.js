import { SlashCommandBuilder, MessageFlags, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField } from 'discord.js';
import { cacheDB } from '../../lib/settingsCache.js';
import { parseDuration } from '../../lib/timeUtils.js';
import cron from 'node-cron';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway（抽選）を管理します。')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('新しいGiveawayをすぐに開始します。')
                .addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('期間 (例: 10m, 1h, 2d)').setRequired(false))
                .addStringOption(option => option.setName('end_time').setDescription('終了日時 (例: 2025-07-22 21:00)').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('schedule')
                .setDescription('未来の指定した日時にGiveawayを開始するよう予約します。')
                .addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true))
                .addStringOption(option => option.setName('start_time').setDescription('開始日時 (例: 2025-07-22 21:00)').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('期間 (例: 1h, 2d)').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('抽選を投稿するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recurring')
                .setDescription('定期的なGiveawayを設定します。')
                .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
                .addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('当選者数').setRequired(true))
                .addStringOption(option => option.setName('schedule').setDescription('スケジュール (cron形式: 分 時 日 月 週)').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('期間 (例: 1h, 2d)').setRequired(true))
                .addChannelOption(option => option.setName('giveaway_channel').setDescription('抽選を投稿するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(true))
                .addChannelOption(option => option.setName('confirmation_channel').setDescription('開催確認を投稿するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(true))
                .addRoleOption(option => option.setName('confirmation_role').setDescription('開催を確認するロール').setRequired(true))
        ),
    async execute(interaction) {
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
            if (endTime.getMinutes() % 10 !== 0 || endTime.getSeconds() !== 0 || endTime.getMilliseconds() !== 0) {
                const roundedEndTime = new Date(endTime);
                const minutes = roundedEndTime.getMinutes();
                const roundedMinutes = (Math.floor(minutes / 10) + 1) * 10;
                roundedEndTime.setMinutes(roundedMinutes, 0, 0);
                const confirmationButton = new ButtonBuilder().setCustomId('confirm_giveaway_time').setLabel('このまま作成').setStyle(ButtonStyle.Primary);
                const cancelButton = new ButtonBuilder().setCustomId('cancel_giveaway_time').setLabel('キャンセル').setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(confirmationButton, cancelButton);
                await interaction.editReply({
                    content: `**【時間設定の確認】**\n指定された終了時刻 **${endTime.toLocaleTimeString('ja-JP')}** は、実際の抽選が行われる **${roundedEndTime.toLocaleTimeString('ja-JP')}** とズレが生じます。\nこのまま作成しますか？`,
                    components: [row]
                });
                try {
                    const collectorFilter = i => i.user.id === interaction.user.id;
                    const confirmation = await interaction.channel.awaitMessageComponent({ filter: collectorFilter, time: 60_000 });
                    if (confirmation.customId === 'confirm_giveaway_time') { await confirmation.update({ content: '✅ Giveawayを作成します...', components: [] }); }
                    else { return confirmation.update({ content: 'キャンセルしました。', components: [] }); }
                } catch (e) { return interaction.editReply({ content: '60秒以内に応答がなかったため、キャンセルしました。', components: [] }); }
            }
            const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway: ${prize}`).setDescription(`リアクションを押して参加しよう！\n終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:R>`).addFields({ name: '当選者数', value: `${winnerCount}名`, inline: true }, { name: '主催者', value: `${interaction.user}`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
            const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
            const row = new ActionRowBuilder().addComponents(participateButton);
            try {
                const message = await channel.send({ embeds: [giveawayEmbed], components: [row] });
                const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                await cacheDB.query(sql, [message.id, interaction.guildId, channel.id, prize, winnerCount, endTime]);
                await interaction.editReply({ content: `✅ Giveawayを ${channel} に作成しました！`, components: [] });
            } catch (error) { console.error('Failed to start giveaway:', error); await interaction.editReply({ content: 'Giveawayの作成中にエラーが発生しました。', components: [] }); }
        } else if (subcommand === 'schedule') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const prize = interaction.options.getString('prize');
            const winnerCount = interaction.options.getInteger('winners');
            const startTimeStr = interaction.options.getString('start_time');
            const durationStr = interaction.options.getString('duration');
            const channel = interaction.options.getChannel('channel');
            const startTime = new Date(startTimeStr.replace(/-/g, '/') + ' GMT+0900');
            if (isNaN(startTime.getTime()) || startTime <= new Date()) { return interaction.editReply('エラー: 開始日時は未来の正しい日時を指定してください。(例: 2025-07-22 21:00)');}
            const durationMs = parseDuration(durationStr);
            if (!durationMs) { return interaction.editReply('エラー: 期間の形式が正しくありません。(例: 1h, 2d)');}
            const durationHours = durationMs / (1000 * 60 * 60);
            const sql = 'INSERT INTO scheduled_giveaways (guild_id, prize, winner_count, start_time, duration_hours, confirmation_channel_id) VALUES ($1, $2, $3, $4, $5, $6)';
            await cacheDB.query(sql, [interaction.guildId, prize, winnerCount, startTime, durationHours, channel.id]);
            await interaction.editReply(`✅ 抽選の予約が完了しました。\n**${startTime.toLocaleString('ja-JP')}** に、${channel} で **「${prize}」** の抽選が開始されます。`);
        } else if (subcommand === 'recurring') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const prize = interaction.options.getString('prize');
            const winnerCount = interaction.options.getInteger('winners');
            const scheduleCron = interaction.options.getString('schedule');
            const durationStr = interaction.options.getString('duration');
            const giveawayChannel = interaction.options.getChannel('giveaway_channel');
            const confirmationChannel = interaction.options.getChannel('confirmation_channel');
            const confirmationRole = interaction.options.getRole('confirmation_role');
            if (!cron.validate(scheduleCron)) { return interaction.editReply('エラー: スケジュールの形式が正しくありません。(cron形式: 分 時 日 月 週)');}
            const durationMs = parseDuration(durationStr);
            if (!durationMs) { return interaction.editReply('エラー: 期間の形式が正しくありません。(例: 1h, 2d)');}
            const durationHours = durationMs / (1000 * 60 * 60);
            const sql = 'INSERT INTO scheduled_giveaways (guild_id, prize, winner_count, schedule_cron, duration_hours, confirmation_channel_id, confirmation_role_id) VALUES ($1, $2, $3, $4, $5, $6, $7)';
            await cacheDB.query(sql, [interaction.guildId, prize, winnerCount, scheduleCron, durationHours, giveawayChannel.id, confirmationRole.id]);
            await interaction.editReply(`✅ 定期抽選を設定しました。\nスケジュール \`${scheduleCron}\` に従って、${confirmationChannel} で開催確認が行われます。`);
        }
    },
};