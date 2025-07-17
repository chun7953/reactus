import pkg from 'discord.js'; 
const { AttachmentBuilder } = pkg;

export class ReactionExport {
    constructor(client, message) {
        this.client = client;
        this.message = message; // チャンネルはメッセージから取得
    }

    isVotingMessage() {
        return this.message.embeds.length > 0 && this.message.embeds[0]?.title;
    }

    async execute(interaction) {
        try {
            const csvData = await this.generateCSV();
            const channel = this.message.channel; // interactionからチャンネルを取得
            const channelName = channel.name;
        // メッセージのタイムスタンプを適切に処理
        const date = new Date(this.message.createdTimestamp);

            const formattedDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
            const attachment = new AttachmentBuilder(Buffer.from(csvData, 'utf-8'), { name: `${channelName}_${formattedDate}.csv` });

            await channel.send({ content: "集計結果", files: [attachment] }); // チャンネルから送信
            await interaction.editReply({ content: "リアクションの集計が完了しました。", ephemeral: true });

        } catch (error) {
            console.error("executeメソッド内でエラーが発生しました:", error);
            await interaction.editReply({ content: "CSVファイルの生成中にエラーが発生しました。", ephemeral: true });
        }
    }

    async generateCSV() {
        try {
            if (!this.message || !this.message.channel) {
                throw new Error("メッセージまたはチャンネルが未定義です。");
            }
    
            const channelName = this.message.channel.name || "unknown_channel"; // Fallback to a default name if undefined
            let csvContent = "\uFEFF"; // BOMを追加
        // メッセージのタイムスタンプを適切に処理
        const date = new Date(this.message.createdTimestamp);

            csvContent += `${channelName}_${this.formatDate(date.getTime())}\n`; // ファイル名（ヘッダー）
            
            // メッセージ内容または投票の質問を取得
            let content = this.message.content || '';
            let options = '';
            if (this.message.embeds.length > 0 && this.message.embeds[0]?.title) {
                // 投票メッセージの場合
                content = this.message.embeds[0].title; // 質問を取得
                options = this.message.embeds[0].description.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0); // オプションを取得し、空白を除去
            }
            
// 質問をCSVに追加
csvContent += `${content.replace(/"/g, '""')}\n`; // メッセージ内容または質問を追加

// オプションが存在する場合はCSVに追加
if (options.length > 0) {
    csvContent += `(${options.join(';')})\n`; // オプションを";"で区切って追加
}
            const reactions = this.message.reactions.cache;
            const totalUsers = new Set(); // ユーザーIDを保持するセット
            const emojiCounts = {};

            // 絵文字ごとのユーザー数をカウント
            for (const reaction of reactions.values()) {
                const users = await reaction.users.fetch();
                const filteredUsers = users.filter(user => !user.bot);
                filteredUsers.forEach(user => totalUsers.add(user.id)); // ユーザーをセットに追加

                emojiCounts[reaction.emoji.name] = filteredUsers.size; // 絵文字のリアクション数を記録
            }

            const totalCount = totalUsers.size; // ユーザーのユニークカウント
            csvContent += `合計人数,${totalCount}人,100%\n`;

            // 各絵文字の人数と割合
            for (const [emoji, count] of Object.entries(emojiCounts)) {
                const percentage = ((count / totalCount) * 100).toFixed(2);
                csvContent += `${emoji},${count},${percentage}%\n`;
            }

            csvContent += `\n絵文字,ユーザー名,他の絵文字\n`; // ヘッダー行

            // ユーザーのリアクション情報を追加
            for (const reaction of reactions.values()) {
                const users = await reaction.users.fetch();
                const filteredUsers = users.filter(user => !user.bot);

                for (const user of filteredUsers.values()) {
                    const member = await this.message.guild.members.fetch(user.id);
                    const displayName = member.displayName;

                    // 他の絵文字を取得する際に現在の絵文字を除外
                    const otherReactions = await this.getOtherReactions(reactions, user.id, reaction.emoji.name);
                    csvContent += `${reaction.emoji.name},"${displayName}","${otherReactions.join(', ')}"\n`;
                }
            }

            // メッセージに返信があった場合の処理
            const replies = await this.getReplies();
            if (replies.length > 0) {
                csvContent += `返信:\n日時,ユーザー名,メッセージ内容\n`;
                for (const reply of replies) {
                    const replyDate = this.formatDate(reply.createdTimestamp + 9 * 60 * 60 * 1000); // UTCからJSTに変換
                    const member = await this.message.guild.members.fetch(reply.author.id);
                    const memberName = member.displayName;
                    csvContent += `${replyDate},"${memberName}","${reply.content}"\n`;
                }
            }

            return csvContent;

        } catch (error) {
            console.error("generateCSVメソッド内でエラーが発生しました:", error);
            throw error; // エラーを再スローして上位に通知
        }
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    async getOtherReactions(reactions, userId, currentEmoji) {
        const otherReactions = [];
        for (const reaction of reactions.values()) {
            const users = await reaction.users.fetch();
            if (users.has(userId) && reaction.emoji.name !== currentEmoji) { // 現在の絵文字を除外
                otherReactions.push(reaction.emoji.name);
            }
        }
        return otherReactions; // 配列を返す
    }

    async getReplies() {
        const replies = await this.message.channel.messages.fetch({
            around: this.message.id,
            limit: 100,
            filter: m => m.reference && m.reference.messageId === this.message.id
        });
        return replies;
    }
}