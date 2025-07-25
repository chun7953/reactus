import { AttachmentBuilder, MessageFlags } from 'discord.js';

export class ReactionExporter {
    constructor(client, message) {
        this.client = client;
        this.message = message;
    }

    // 第2引数で公開・非公開を受け取る
    async execute(interaction, isPublic = false) {
        try {
            // 「処理中...」という一時的なメッセージを本人にだけ表示
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const csvData = await this.generateCSV();
            const channel = this.message.channel;
            const channelName = channel.name || 'unknown-channel';

            const date = new Date(this.message.createdTimestamp);
            const formattedDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

            const attachment = new AttachmentBuilder(Buffer.from(csvData, 'utf-8'), { name: `${channelName}_${formattedDate}.csv` });

            if (isPublic) {
                // public=trueならチャンネルに投稿
                const questionTitle = this.message.embeds[0]?.title;
                const content = questionTitle ? `**「${questionTitle}」の集計結果**` : '集計結果';
                await channel.send({ content: content, files: [attachment] });
                await interaction.editReply({ content: "リアクションの集計が完了し、チャンネルにCSVファイルを送信しました。" });
            } else {
                // public=falseなら本人にだけ見えるメッセージで返信
                await interaction.editReply({ content: "リアクションの集計が完了しました。", files: [attachment] });
            }

        } catch (error) {
            console.error("Error in ReactionExporter execute:", error);
            const errorMessage = "CSVファイルの生成中にエラーが発生しました。";
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
            }
        }
    }

    async generateCSV() {
        if (!this.message || !this.message.channel) {
            throw new Error("Message or channel is undefined.");
        }

        let csvContent = "\uFEFF"; // BOM for UTF-8 Excel compatibility

        const reactions = this.message.reactions.cache;
        if (reactions.size === 0) {
            return "このメッセージにはリアクションがありません。";
        }

        const allUsers = new Map();

        for (const reaction of reactions.values()) {
            const users = await reaction.users.fetch();
            for (const user of users.filter(u => !u.bot).values()) {
                if (!allUsers.has(user.id)) {
                    const member = await this.message.guild.members.fetch(user.id).catch(() => null);
                    allUsers.set(user.id, {
                        displayName: member ? member.displayName : user.username,
                        reactions: new Set()
                    });
                }
                allUsers.get(user.id).reactions.add(reaction.emoji.name);
            }
        }

        const question = this.message.embeds[0]?.title || this.message.content;
        csvContent += `質問:,"${question.replace(/"/g, '""')}"\n`;
        csvContent += `総リアクションユーザー数:,${allUsers.size}\n\n`;
        csvContent += "ユーザー名,リアクション\n";

        for (const data of allUsers.values()) {
            csvContent += `"${data.displayName.replace(/"/g, '""')}","${[...data.reactions].join(', ')}"\n`;
        }

        return csvContent;
    }
}