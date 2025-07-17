import { ActionRowBuilder, ButtonBuilder, PermissionsBitField } from 'discord.js';
import { backupToSpreadsheet, removeReactionFromSpreadsheet, restoreFromSpreadsheet, saveAnnouncement, backupAnnouncementToSpreadsheet, deleteAnnouncement, removeAnnouncementFromSpreadsheet } from './backup.js';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { fetchAnnouncement } from './index.js';
import { ReactionExport } from './reactionExport.js'; // ReactionExportクラスをインポート
import { createPoll } from './poll.js';

let lastInteractionTimestamp = 0; // 最後のインタラクションのタイムスタンプ
const debounceTime = 1000; // デバウンス時間（ミリ秒）
let isProcessingInteraction = false; // インタラクション処理中フラグ

export const handleInteraction = async (interaction, db) => {
    // すでに処理中の場合はリプライしない
    if (isProcessingInteraction) {
        return; // このリクエストを無視（リプライなし）
    }

    // 処理開始
    isProcessingInteraction = true;

    const now = Date.now();

    // デバウンスチェック
    if (now - lastInteractionTimestamp < debounceTime) {
        console.log(`Debounced interaction: ${interaction.commandName}`);
        isProcessingInteraction = false; // 処理完了
        return; // デバウンス時間内の場合は処理をスキップ
    }
    lastInteractionTimestamp = now; // タイムスタンプを更新
    console.log(`Received interaction: ${interaction.commandName || interaction.customId}`);

    if (interaction.isCommand()) {
        const { commandName, options } = interaction;
        const guildId = interaction.guild.id;

        try {
            // 応答がすでに行われている場合は処理を中断
            if (interaction.replied) {
                isProcessingInteraction = false; // 処理完了
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            console.log(`Processing command: ${commandName}`);

            switch (commandName) {
                case 'setreaction':
                    await handleSetReaction(interaction, options, db, guildId);
                    break;
                case 'removereaction':
                    await handleRemoveReaction(interaction, options, db, guildId);
                    break;
                case 'listreactions':
                    await handleListReactions(interaction, db, guildId);
                    break;
                case 'help':
                    await handleHelp(interaction);
                    break;
                case 'feedback':
                    await handleFeedback(interaction);
                    break;
                case 'backup':
                    await handleBackup(interaction, guildId);
                    break;
                case 'restore':
                    await handleRestore(interaction, guildId);
                    break;
                case 'reacttomessage':
                    await handleReactToMessage(interaction, options, db);
                    break;
                    case 'startannounce':
    await handleStartAnnounce(interaction, options, guildId);
    break;
case 'stopannounce':
    await handleStopAnnounce(interaction, guildId);
    break;
    case 'csvreactions':
        await handleCsvReactions(interaction);
        break;
        case 'poll': // ここにpollコマンドの処理を追加
        const question = options.getString('question');
        const optionsString = options.getString('options');
        const mention = options.getString('mention'); // mentionオプションの取得

        console.log("Command Name:", commandName);
        console.log("Question:", question);
        console.log("Options:", optionsString);
        console.log("Mention:", mention); // mentionの確認

        await createPoll(interaction, commandName, question, optionsString, mention);
        break;
                default:
                    await interaction.editReply({ content: '無効なコマンドです。', ephemeral: true });
            }
        } catch (error) {
            console.error('Error handling interaction:', error);
            if (!interaction.replied) {
                await interaction.editReply({ content: 'エラーが発生しました。', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        // ボタンのインタラクションでもデバウンスチェック
        if (interaction.replied) {
            isProcessingInteraction = false; // 処理完了
            return;
        }
        await handleButtonInteraction(interaction);
    }

    // 全ての処理が完了した後、フラグをリセット
    isProcessingInteraction = false;
};

async function handleSetReaction(interaction, options, db, guildId) {
    const channel = options.getChannel('channel');
    const emojis = options.getString('emojis').split(',').map(emoji => emoji.trim());
    const trigger = options.getString('trigger');

    console.log(`チャンネル: ${channel.name}, トリガー: ${trigger}, 絵文字: ${emojis.join(', ')} の設定を開始しています`);

    try {
        // 応答がすでに行われているか確認
        if (interaction.replied) return;

        const count = await new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count FROM reactions WHERE guild_id = ?`, [guildId], (err, row) => {
                if (err) {
                    console.error('リアクション数の取得中にエラーが発生:', err.message);
                    return reject(err);
                }
                resolve(row.count);
            });
        });

        const remainingSlots = 100 - count;
        if (remainingSlots <= 0) {
            await interaction.editReply({ content: 'このサーバーで設定できるリアクションの件数は100件に達しました。', ephemeral: true });
            return;
        }

        // 重複チェック: 既存の設定を取得
        db.get(`SELECT * FROM reactions WHERE guild_id = ? AND channel_id = ? AND trigger = ?`, [guildId, channel.id, trigger], async (err, row) => {
            if (err) {
                console.error('Database query error:', err.message);
                if (!interaction.replied) {
                    await interaction.editReply({ content: 'エラーが発生しました。', ephemeral: true });
                }
                return;
            }

            if (row) {
                // 既存の設定がある場合、削除するように促すメッセージを表示
                await interaction.editReply({
                    content: 'そのトリガーは使用されています。一度削除してください。',
                    ephemeral: true
                });
                return;
             } else {
                // 新しい設定を追加
                db.run(`INSERT INTO reactions (guild_id, channel_id, emojis, trigger) VALUES (?, ?, ?, ?)`,
                    [guildId, channel.id, emojis.join(','), trigger], async (err) => {
                        if (err) {
                            console.error('Database insert error:', err.message);
                            if (!interaction.replied) {
                                await interaction.editReply({ content: '設定を保存できませんでした。', ephemeral: true });
                            }
                            return;
                        }

                        try {
                            await backupToSpreadsheet(guildId);
                            await interaction.editReply({ content: `自動リアクションが設定されました！チャンネル: ${channel.name}, 絵文字: ${emojis.join(', ')}, トリガーワード: ${trigger}。`, ephemeral: true });
                        } catch (backupError) {
                            console.error('Error during backup:', backupError);
                            if (!interaction.replied) {
                                await interaction.editReply({ content: 'バックアップ中にエラーが発生しました。', ephemeral: true });
                            }
                        }
                    });
            }
        });
    } catch (error) {
        console.error('handleSetReaction内でのエラー:', error);
        if (!interaction.replied) {
            await interaction.editReply({ content: 'エラーが発生しました。', ephemeral: true });
        }
    }
}

async function handleRemoveReaction(interaction, options, db, guildId) {
    const channel = options.getChannel('channel');
    const trigger = options.getString('trigger');
    if (interaction.replied) return; // 応答がすでに行われている場合は処理を中断

    db.get(`SELECT * FROM reactions WHERE guild_id = ? AND channel_id = ? AND trigger = ?`, [guildId, channel.id, trigger], async (err, row) => {
        if (err) {
            console.error('Database query error:', err.message);
            if (!interaction.replied) {
                await interaction.editReply({ content: '設定を解除できませんでした。', ephemeral: true });
            }
            return;
        }

        if (!row) {
            await interaction.editReply({ content: '指定された設定は存在しません。', ephemeral: true });
            return;
        } else {
            db.run(`DELETE FROM reactions WHERE guild_id = ? AND channel_id = ? AND trigger = ?`, [guildId, channel.id, trigger], async (err) => {
                if (err) {
                    console.error('Database delete error:', err.message);
                    if (!interaction.replied) {
                        await interaction.editReply({ content: '設定を解除できませんでした。', ephemeral: true });
                    }
                    return;
                }

                try {
                    await removeReactionFromSpreadsheet(guildId, channel.id, trigger);
                    await interaction.editReply({ content: `自動リアクションの設定が解除されました！チャンネル: ${channel.name}, トリガーワード: ${trigger}`, ephemeral: true });
                } catch (removeError) {
                    console.error('Error during removal from spreadsheet:', removeError);
                    if (!interaction.replied) {
                        await interaction.editReply({ content: 'スプレッドシートからの削除中にエラーが発生しました。', ephemeral: true });
                    }
                }
            });
        }
    });
}

async function handleListReactions(interaction, db, guildId) {
    if (interaction.replied) return; // 応答がすでに行われている場合は処理を中断

    let response = '現在のリアクション設定:\n';

    const channels = interaction.guild.channels.cache;

    db.all(`SELECT * FROM reactions WHERE guild_id = ?`, [guildId], async (err, rows) => {
        if (err) {
            console.error('Database query error:', err.message);
            if (!interaction.replied) {
                await interaction.editReply({ content: 'エラーが発生しました。', ephemeral: true });
            }
            return;
        }

        const accessibleReactions = rows.filter(row => {
            const channel = channels.get(row.channel_id);
            return channel && channel.permissionsFor(interaction.user).has(PermissionsBitField.Flags.ViewChannel);
        });

        if (accessibleReactions.length === 0) {
            response = '取得可能なリストはありません。';
        } else {
            accessibleReactions.forEach((row) => {
                response += `チャンネル: <#${row.channel_id}>, 絵文字: ${row.emojis}, トリガーワード: ${row.trigger}\n`;
            });
        }

        // エフェメラルメッセージを送信
        await interaction.editReply({ content: response, ephemeral: true });
    });
}

async function handleHelp(interaction) {
    if (interaction.replied) return; // 応答がすでに行われている場合は処理を中断

    await interaction.editReply({
        content: 'このボットの使用方法:\n\n' +
        '**1. `/setreaction`** - 自動リアクションを設定します。⚠️ 一度に設定できるリアクションは100件までです。\n' +
        '**2. `/removereaction`** - 自動リアクションの設定を解除します。⚠️ トリガーワードが正確である必要があります。\n' +
        '**3. `/listreactions`** - 現在のリアクション設定を表示します。⚠️ アクセス権が必要です。\n' +
        '**4. `/startannounce`** - 自動アナウンスを設定します。⚠️ 一つのチャンネルにつき一件のみです。\n' +
        '**5. `/stopannounce`** - 自動アナウンスを解除します。⚠️ コマンド実行のチャンネルのみ解除されます。\n' +
        '**6. `/poll`** - 簡易投票を行います。⚠️ options同士はカンマで区切り、絵文字と選択肢文字列の間には何も入れないでください。あるいは、絵文字か文字列のどちらかのみを入力してください。\n' +
        '**7. `/csvreactions`** - リアクションを集計します。⚠️ CSVとして、リアクションごとにユーザーリストが出力されます。\n' +
        '**8. `/feedback`** - フィードバックはReactus開発室でお聞かせください！⚠️ 具体的な内容を含めると助かります。\n' +
        '**9. `/backup`** - バックアップを開始します。⚠️ バックアップには一定の時間がかかる場合があります。\n' +
        '**10. `/restore`** - バックアップから復元します。⚠️ 復元は上書きされるため、事前に確認してください。\n\n' +
        'これらのコマンドを利用して、ボットの機能を最大限に活用してください！',
        ephemeral: true
    });
}

async function handleFeedback(interaction) {
    if (interaction.replied) return; // 応答がすでに行われている場合は処理を中断

    try {
        await interaction.editReply({
            content: `フィードバックはReactus開発室でお聞かせください！\n[Discordサーバーへの招待リンク](https://discord.gg/m6mFzzEQhr)`,
            ephemeral: true
        });
    } catch (error) {
        console.error('フィードバック案内メッセージの送信中にエラーが発生しました:', error);
        await interaction.editReply({
            content: 'フィードバック案内の送信中にエラーが発生しました。もう一度お試しください。',
            ephemeral: true
        });
    }
}

async function handleBackup(interaction, guildId) {
    console.log('バックアップ処理を開始します...');
    const startTime = Date.now();

    try {
        // リアクションのバックアップ
        await backupToSpreadsheet(guildId);

        const endTime = Date.now();
        await interaction.editReply({ content: `バックアップ処理が完了しました。処理時間: ${endTime - startTime}ms`, ephemeral: true });
    } catch (error) {
        console.error('バックアップ中にエラーが発生しました:', `${error.message}\n${error.stack}`);

        if (!interaction.replied) {
            await interaction.editReply({ content: 'バックアップ中にエラーが発生しました。詳細: ' + error.message, ephemeral: true });
        }
    }
}

async function handleRestore(interaction, guildId) {
    console.log('復元処理を開始します...');
    const startTime = Date.now();

    try {
        const { serviceAccountAuth, sheets, spreadsheetId } = await initializeSheetsAPI();
        const sheetName = `Guild_${guildId}`; 

        const sheetResponse = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
        });

        const sheetExists = sheetResponse.data.sheets.some(sheet => sheet.properties.title === sheetName);
        if (!sheetExists) {
            await interaction.editReply({ content: '復元するデータがありません。', ephemeral: true });
            console.log('復元するデータがありません。');
            return; 
        }

        await restoreFromSpreadsheet(guildId);
        await interaction.editReply({ content: '復元が完了しました。', ephemeral: true });
    } catch (error) {
        console.error('復元中にエラーが発生しました:', `${error.message}\n${error.stack}`);
        if (!interaction.replied) {
            await interaction.editReply({ content: '復元中にエラーが発生しました。', ephemeral: true });
        }
    }
}

async function handleReactToMessage(interaction, options, db) {
    const messageId = options.getString('message_id');
    const channel = options.getChannel('channel');

    try {
        const targetChannel = await interaction.client.channels.fetch(channel.id);

        // チャンネルが正しいか確認
        if (targetChannel.guild.id !== interaction.guild.id) {
            await interaction.editReply({ content: '指定されたチャンネルはこのサーバーに属していません。', ephemeral: true });
            return;
        }

        const message = await targetChannel.messages.fetch(messageId);

        // このチャンネルに対するリアクション設定を取得
        db.all(`SELECT * FROM reactions WHERE guild_id = ? AND channel_id = ?`, [interaction.guild.id, channel.id], async (err, rows) => {
            if (err) {
                console.error('Database query error:', err.message);
                if (!interaction.replied) {
                    await interaction.editReply({ content: 'エラーが発生しました。', ephemeral: true });
                }
                return;
            }

            let hasTrigger = false;

            for (const row of rows) {
                // メッセージ内容にトリガーが含まれているかチェック
                if (message.content.includes(row.trigger)) {
                    hasTrigger = true;
                    const emojis = row.emojis.split(',').map(emoji => emoji.trim());

                    for (const emoji of emojis) {
                        try {
                            await message.react(emoji); // リアクションを追加
                        } catch (reactionError) {
                            console.error('リアクション中にエラーが発生しました:', reactionError);
                            if (!interaction.replied) {
                                await interaction.editReply({ content: 'リアクションを追加中にエラーが発生しました。', ephemeral: true });
                            }
                        }
                    }
                }
            }

            if (hasTrigger) {
                await interaction.editReply({ content: '指定したメッセージにリアクションを追加しました。', ephemeral: true });
            } else {
                await interaction.editReply({ content: '指定したメッセージにはトリガーが含まれていません。', ephemeral: true });
            }
        });
    } catch (error) {
        console.error('メッセージ取得エラー:', error);
        if (!interaction.replied) {
            await interaction.editReply({ content: '指定したメッセージを取得できませんでした。', ephemeral: true });
        }
    }
}

async function handleStartAnnounce(interaction) {
    console.log('インタラクションを処理中: startannounce');

    if (interaction.replied) {
        return; // すでに応答が行われている場合は処理を中断
    }

    const channel = interaction.channel; // コマンドが実行されたチャンネル
    const options = interaction.options;
    const messageContent = options.getString('message');
    const guildId = interaction.guild.id; // ギルドIDを取得
    const channelId = interaction.channelId; // チャンネルIDを取得
    const botId = process.env.CLIENT_ID; // 環境変数からボットのIDを取得

    try {
        // ボットのメンバーオブジェクトを取得
        const botMember = await interaction.guild.members.fetch(botId); // ボットのメンバーオブジェクトを取得
        const botPermissions = channel.permissionsFor(botMember); // ボットの権限を確認

        // 権限の確認
        if (!botPermissions.has(PermissionsBitField.Flags.ViewChannel)) {
            await interaction.editReply({ content: 'このチャンネルのメッセージ履歴を確認する権限がありません。', ephemeral: true });
            return;
        }

        if (!botPermissions.has(PermissionsBitField.Flags.SendMessages)) {
            await interaction.editReply({ content: 'このチャンネルにメッセージを送信する権限がありません。', ephemeral: true });
            return;
        }
        // 既存のアナウンスを取得
        const existingAnnouncement = await fetchAnnouncement(guildId);
        
        // 既存アナウンスがある場合、削除
        if (existingAnnouncement) {
            await deleteAnnouncement(guildId, channelId); // SQLiteから削除
           await removeAnnouncementFromSpreadsheet(guildId, channelId); // チャンネルIDを渡す
            console.log('既存のアナウンスが削除されました。');
        }

        // 新しいアナウンスを保存
        await saveAnnouncement(guildId, channelId, messageContent);

        // アナウンスをバックアップ
await backupAnnouncementToSpreadsheet(guildId, channelId, messageContent); // チャンネルIDとメッセージ内容を渡す
        // アナウンスを送信
        await channel.send(messageContent);

        // インタラクションに対して確認の返信
        await interaction.editReply({ content: 'アナウンスが送信されました！', ephemeral: true }); // 最終的な応答
    } catch (error) {
        console.error('エラーが発生しました:', error);
        // エラー発生時も応答が行われていないか確認
        if (!interaction.replied) {
            await interaction.editReply({ content: 'アナウンス処理中にエラーが発生しました。', ephemeral: true });
        }
    }
}

async function handleStopAnnounce(interaction, guildId) {
    const channelId = interaction.channel.id;

    // アナウンスを削除
    await deleteAnnouncement(guildId, channelId);
    
    // Google Sheetsからアナウンスデータを削除
        await removeAnnouncementFromSpreadsheet(guildId, channelId); // チャンネルIDを渡す
    
    await interaction.editReply({ content: 'アナウンスが停止されました。', ephemeral: true });
}

async function handleCsvReactions(interaction) {
    const messageId = interaction.options.getString('message_id'); // メッセージIDを取得

    try {
        // コマンドが実行されたチャンネルからメッセージを取得
        const message = await interaction.channel.messages.fetch(messageId);
        
        // メッセージが取得できたか確認
        if (!message) {
            await interaction.editReply({ content: '指定されたメッセージが見つかりませんでした。', ephemeral: true });
            return;
        }

        // ReactionExportのインスタンスを作成（チャンネルはメッセージから取得する）
        const reactionExport = new ReactionExport(interaction.client, message);
        await reactionExport.execute(interaction); // interactionを渡す

        // 応答を済ませる
        await interaction.editReply({ content: 'リアクションの集計結果を送信しました。', ephemeral: true });
    } catch (error) {
        console.error('メッセージ取得中にエラーが発生しました:', error);
        await interaction.editReply({ content: '指定されたメッセージを取得できませんでした。', ephemeral: true });
    }
}

async function handleButtonInteraction(interaction) {
    const buttonIdParts = interaction.customId.split('_');

    if (buttonIdParts[0] === 'csvreactions' && buttonIdParts.length === 2) {
        const messageId = buttonIdParts[1];

        try {
            // コマンドが実行されたチャンネルからメッセージを取得
            const message = await interaction.channel.messages.fetch(messageId);
            
            // メッセージが取得できたか確認
            if (!message) {
                await interaction.reply({ content: '指定されたメッセージが見つかりませんでした。', ephemeral: true });
                return;
            }

            // ReactionExportのインスタンスを作成
            const reactionExport = new ReactionExport(interaction.client, message);
                        // 最初のリプライを送信
                        await interaction.reply({ content: 'リアクションの集計を開始します...', ephemeral: true });

            await reactionExport.execute(interaction); // interactionを渡す



            
        } catch (error) {
            console.error('メッセージ取得中にエラーが発生しました:', error);
            await interaction.editReply({ content: '指定されたメッセージを取得できませんでした。', ephemeral: true });
        }
    } else {
        console.error('無効なボタンのインタラクションです。', interaction.customId);
        await interaction.editReply({ content: '無効なボタンのインタラクションです。', ephemeral: true });
    }
}

