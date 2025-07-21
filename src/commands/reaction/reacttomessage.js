import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { getReactionSettings } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reacttomessage')
        .setDescription('指定したメッセージに、設定済みの自動リアクションを手動で適用します。')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('リアクションを追加したいメッセージのID')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('そのメッセージが存在するチャンネル（指定しない場合は現在のチャンネル）')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const messageId = interaction.options.getString('message_id');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const guildId = interaction.guild.id;

        try {
            const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
            if (!targetChannel.permissionsFor(botMember).has(PermissionsBitField.Flags.ViewChannel)) {
                return interaction.editReply('指定されたチャンネルを閲覧する権限がありません。');
            }

            const message = await targetChannel.messages.fetch(messageId);
            
            const settings = getReactionSettings(guildId);
            const relevantSetting = settings.find(s =>
                s.channel_id === targetChannel.id && message.content.includes(s.trigger)
            );

            if (!relevantSetting) {
                return interaction.editReply('このメッセージに適用できる自動リアクション設定（トリガーワード）が見つかりませんでした。');
            }

            const emojis = relevantSetting.emojis.split(',');
            let reactedCount = 0;
            for (const emoji of emojis) {
                await message.react(emoji.trim()).catch(err => console.error(`Failed to react with ${emoji}:`, err));
                reactedCount++;
            }

            await interaction.editReply(`✅ ${reactedCount}個のリアクションをメッセージに適用しました。`);

        } catch (error) {
            console.error('Error in reacttomessage command:', error);
            await interaction.editReply('メッセージが見つからないか、リアクションの適用中にエラーが発生しました。');
        }
    },
};