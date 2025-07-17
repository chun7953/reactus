import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const MAX_COMMAND_LENGTH = 1200;
const DEFAULT_EMOJIS = Array.from({ length: 20 }, (_, i) => String.fromCodePoint(0x1F1E6 + i)); // 🇦〜🇹の絵文字
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = DEFAULT_EMOJIS.length;

const polls = new Map(); // 投票データを保持

async function addReactionsWithRetry(pollMessage, finalOptions) {
    for (const opt of finalOptions) {
        let retries = 3; // 最大リトライ回数
        let success = false;

        while (retries > 0 && !success) {
            try {
                await pollMessage.react(opt.emoji); // リアクションを追加する
                success = true; // 成功したらループを抜ける
            } catch (error) {
                console.error(`リアクション ${opt.emoji} の追加中にエラーが発生しました:`, error);
                retries--; // リトライ回数を減らす
                if (retries === 0) {
                    console.error(`3回の試行後、リアクション ${opt.emoji} の追加に失敗しました`);
                }
            }
        }
    }
}

export async function createPoll(interaction, command, question, optionsString, exclusive, mention) {
    console.log("Received options:", optionsString);

    // メンションの処理
    let mentionString = mention ? mention : '';

    // 入力チェック
    if (!optionsString || (typeof optionsString === 'string' && optionsString.trim() === '')) {
        return interaction.editReply("選択肢が指定されていません。少なくとも1つの選択肢を提供してください。");
    }

    // `optionsString ` が文字列か配列かを確認し、適切に処理
    let optionsArray;
    if (typeof optionsString === 'string') {
        optionsArray = optionsString.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
    } else if (Array.isArray(optionsString)) {
        optionsArray = optionsString.map(opt => opt.trim());
    } else {
        console.error("無効な選択肢形式:", optionsString);
        return interaction.editReply("選択肢の形式が無効です。");
    }

    // 受け取った選択肢の確認
    console.log("Received options:", optionsArray);

    const finalOptions = [];
    let defaultEmojiIndex = 0;

// optionsArrayの全要素をループ処理
for (let i = 0; i < optionsArray.length; i++) {
    const opt = optionsArray[i].trim();
    
    // 絵文字とテキストを分けるための正規表現
    const emojiMatch = opt.match(/^((?:<a?:\w+:\d+>|[\p{Emoji}]+))(.*)$/u); // 絵文字とテキストを分ける

    // 絵文字が見つかった場合
    if (emojiMatch) {
        const emoji = emojiMatch[1].trim(); // 絵文字部分
        const text = emojiMatch[2].trim(); // テキスト部分（空白も考慮）
        finalOptions.push({ emoji, text: text || '' }); // 絵文字とテキストを分けて追加
    } 
    // 絵文字でない場合、デフォルト絵文字を使用
    else {
        const emoji = DEFAULT_EMOJIS[defaultEmojiIndex++ % DEFAULT_EMOJIS.length];
        finalOptions.push({ emoji, text: opt }); // 現在の要素をテキストとして使用
    }
}

// 最終的な選択肢を確認
console.log("Final options:", finalOptions);

    // 一択の場合は❌を追加
    if (finalOptions.length === 1) {
        finalOptions.push({ emoji: '❌', text: 'Yes or No' });
    }

    const commandLength = question.length + finalOptions.map(opt => opt.text).join(',').length + mentionString.length;
    if (commandLength > MAX_COMMAND_LENGTH) {
        return interaction.editReply("コマンドが長すぎます。最大1200文字までです。");
    }

    if (finalOptions.length > 20) {
        return interaction.editReply("選択肢が20個を超えています。");
    }

    const pollEmbed = new EmbedBuilder()
    .setColor('#0099ff')
        .setTitle(question) // 質問をタイトルとして設定
        .setDescription(mentionString + '\n' + finalOptions.map(opt => `${opt.emoji} ${opt.text}`).join('\n'))
        .setFooter({ text: 'リアクションで投票できます' });

    try {
        const pollMessage = await interaction.channel.send({ embeds: [pollEmbed] });

    await addReactionsWithRetry(pollMessage, finalOptions); // リトライ機能付きでリアクションを追加

    // CSVリアクションボタンの作成
    const csvButton = new ButtonBuilder()
    .setCustomId(`csvreactions_${pollMessage.id}`) // メッセージIDを含める
    .setLabel('集計結果の生成')
    .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(csvButton);

    // ボタンをメッセージに追加
    await pollMessage.edit({ components: [row] });
      
        // 投票データを保存
        polls.set(pollMessage.id, { question, optionsString: finalOptions.map(opt => opt.text), creator: interaction.user.id });
        await interaction.editReply({ content: "投票が作成されました！", ephemeral: true });
    } catch (error) {
        console.error("Error while sending poll message:", error);
        await interaction.editReply("投票の作成中にエラーが発生しました。");
    }
}

function excludeReaction(event) {
    const user = event.user;
    if (user.bot || event.channel.type === 'DM') return;

    const message = event.message;
    const pollEmbed = message.embeds[0];

    if (!pollEmbed || !pollEmbed.title.startsWith("投票")) return;

    const reactions = message.reactions.cache;
    if (!reactions.some(reaction => reaction.emoji.name === event.emoji.name)) {
        message.reactions.remove(event.emoji).catch(console.error);
        return;
    }

    const reacted = lastReactions.get(message.id) || new Set();
    reacted.add(user.id);
    lastReactions.set(message.id, reacted);

    if (pollEmbed.color === '#FF0000') { // Exclusive Poll
        reactions.forEach(reaction => {
            if (reaction.emoji.name !== event.emoji.name) {
                message.reactions.remove(reaction.emoji).catch(console.error);
            }
        });
    }
}

function isEmoji(emoji) {
    // 絵文字の正規表現を使用して確認（Unicode範囲を考慮）
    return /^<a?:.+:\d+>$/.test(emoji) || emoji.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\d]/u);
}

async function checkExternalEmoji(interaction, optionsString) {
    if (interaction.channel.type === 'DM' || interaction.guild.me.permissions.has('USE_EXTERNAL_EMOJIS')) {
        return true;
    }

    for (const emoji of optionsString) {
        if (isEmoji(emoji) && !interaction.guild.emojis.cache.some(e => e.id === emoji.match(/<a?:.+:(\d+)>/)[1])) {
            return interaction.editReply("外部の絵文字が利用できません。");
        }
    }
    return true;
}

async function validateQuery(interaction, query) {
    if (query.length > 240) {
        return interaction.editReply("質問文が長すぎます。240文字以下にしてください。");
    }
    return true;
}