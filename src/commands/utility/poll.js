import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

const DEFAULT_EMOJIS = Array.from({ length: 20 }, (_, i) => String.fromCodePoint(0x1F1E6 + i)); // Regional indicators A-T

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('簡単な投票を作成します。')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('投票の質問')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('options')
                .setDescription('選択肢（カンマ区切り、絵文字も利用可）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mention')
                .setDescription('通知するメンション（@everyone, @here, ロールIDなど）')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const question = interaction.options.getString('question');
        const optionsString = interaction.options.getString('options');
        const mention = interaction.options.getString('mention') || '';

        const optionsArray = optionsString.split(',').map(opt => opt.trim()).filter(Boolean);

        if (optionsArray.length === 0) {
            return interaction.editReply("選択肢が指定されていません。");
        }
        if (optionsArray.length > 20) {
            return interaction.editReply("選択肢が多すぎます。20個以下にしてください。");
        }

        const finalOptions = [];
        let defaultEmojiIndex = 0;

        for (const opt of optionsArray) {
            const emojiMatch = opt.match(/^((?:<a?:\w+:\d+>|[\p{Emoji}]+))\s*(.*)$/u);
            if (emojiMatch) {
                finalOptions.push({ emoji: emojiMatch[1].trim(), text: emojiMatch[2].trim() || '\u200b' }); // Use zero-width space for empty text
            } else {
                finalOptions.push({ emoji: DEFAULT_EMOJIS[defaultEmojiIndex++], text: opt });
            }
        }
        
        const description = finalOptions.map(opt => `${opt.emoji} ${opt.text}`).join('\n');
        
        const pollEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(question)
            .setDescription(`${mention}\n\n${description}`.trim())
            .setFooter({ text: 'リアクションで投票してください。' });

        try {
            const pollMessage = await interaction.channel.send({ embeds: [pollEmbed] });

            for (const opt of finalOptions) {
                await pollMessage.react(opt.emoji).catch(console.error);
            }
            
            const csvButton = new ButtonBuilder()
                .setCustomId(`csvreactions_${pollMessage.id}`)
                .setLabel('集計結果を生成')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(csvButton);
            
            await pollMessage.edit({ components: [row] });

            await interaction.editReply({ content: '投票を作成しました！', ephemeral: true });

        } catch (error) {
            console.error("Error creating poll:", error);
            await interaction.editReply("投票の作成中にエラーが発生しました。");
        }
    },
};