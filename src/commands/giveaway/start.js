import { SlashCommandBuilder, MessageFlags, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { cacheDB } from '../../lib/settingsCache.js';
import { parseDuration } from '../../lib/timeUtils.js'; // (後で作成します)

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway（抽選）を管理します。')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('新しいGiveawayを開始します。')
                .addStringOption(option => option.setName('prize').setDescription('賞品').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('期間 (例: 10m, 1h, 2d)').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('当選者数（デフォルトは1名）').setRequired(false))
                .addChannelOption(option => option.setName('channel').setDescription('抽選を投稿するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(false))
        ),
    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'start') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners') || 1;
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            const durationMs = parseDuration(durationStr);
            if (!durationMs) {
                return interaction.editReply('期間の形式が正しくありません。(例: 10m, 1h, 2d)');
            }
            const endTime = new Date(Date.now() + durationMs);

            const giveawayEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway: ${prize}`)
                .setDescription(`リアクションを押して参加しよう！\n終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:R>`)
                .addFields(
                    { name: '当選者数', value: `${winnerCount}名`, inline: true },
                    { name: '主催者', value: `${interaction.user}`, inline: true }
                )
                .setColor(0x5865F2) // Discord Blurple
                .setTimestamp(endTime);
            
            const participateButton = new ButtonBuilder()
                .setCustomId('giveaway_participate')
                .setLabel('参加する')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎉');

            const row = new ActionRowBuilder().addComponents(participateButton);

            try {
                const message = await channel.send({ embeds: [giveawayEmbed], components: [row] });

                const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                await cacheDB.query(sql, [message.id, interaction.guildId, channel.id, prize, winnerCount, endTime]);

                await interaction.editReply(`✅ Giveawayを ${channel} に作成しました！`);

            } catch (error) {
                console.error('Failed to start giveaway:', error);
                await interaction.editReply('Giveawayの作成中にエラーが発生しました。');
            }
        }
    },
};