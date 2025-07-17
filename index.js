import dotenv from 'dotenv';
import { Client as DiscordClient, GatewayIntentBits } from 'discord.js';
import express from 'express';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { handleInteraction } from './interactionHandler.js';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数の読み込み
dotenv.config();

// Expressアプリの初期化
const app = express();

// サーバーの初期化
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}).on('error', (error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});

// RESTクライアントの初期化
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN); // トークンを設定

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
});

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Discordクライアントの初期化
const client = new DiscordClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
              GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildEmojisAndStickers,
    ]
});

// ディレクトリが存在しない場合は作成する
const dbDirectory = './data';
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory);
}

// SQLiteデータベースの接続
let db = new sqlite3.Database(path.join(dbDirectory, 'reactionSettings.sqlite'), (err) => {
    if (err) {
        console.error('データベース接続エラー:', err.message);
        process.exit(1);
    }
    console.log('SQLiteデータベースに接続しました。');
    createTables(db);
});

function createTables(db) {
    db.run(`CREATE TABLE IF NOT EXISTS bot_lock (
        id INTEGER PRIMARY KEY,
        is_locked INTEGER DEFAULT 0
    )`, (err) => {
        if (err) {
            console.error('ロックテーブル作成エラー:', err.message);
        } else {
            console.log('bot_lock テーブルが作成または既に存在しています。');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS reactions (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        emojis TEXT NOT NULL,
        trigger TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id, trigger)
    )`, (err) => {
        if (err) {
            console.error('テーブル作成エラー:', err.message);
        } else {
            console.log('reactions テーブルが作成または既に存在しています。');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
    )`, (err) => {
        if (err) {
            console.error('アナウンステーブル作成エラー:', err.message);
        } else {
            console.log('announcements テーブルが作成または既に存在しています。');
        }
    });
}

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public'))); // 'public'フォルダ内のファイルを提供

// ルートを追加
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 認可コードを受け取るためのエンドポイント
app.get('/interactions', async (req, res) => {
    const { code } = req.query;

    if (code) {
        try {
            const tokenData = await getAccessToken(code);
            console.log('Access Token Data:', tokenData);
            res.send('Reactusがサーバーに参加しました。');
        } catch (error) {
            console.error('Error fetching access token:', error);
            res.send('エラーが発生しました。');
        }
    } else {
        res.send('エラー: 認可コードが提供されていません。');
    }
});

// アクセストークンを取得する関数
async function getAccessToken(code) {
    const clientId = process.env.CLIENT_ID; // 環境変数から取得
    const clientSecret = process.env.DISCORD_CLIENT_SECRET; // 環境変数から取得
    const redirectUri = process.env.REDIRECT_URI; // 環境変数から取得

    const url = 'https://discord.com/api/oauth2/token';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'client_id': clientId,
            'client_secret': clientSecret,
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirectUri,
        }),
    };

    try {
        const response = await fetch(url, options);
        
        // レスポンスの状態を確認
        if (!response.ok) {
            const errorText = await response.text(); // エラーレスポンスを取得
            throw new Error(`HTTPエラー: ${response.status} - ${errorText}`);
        }

        const jsonResponse = await response.json(); // JSONとしてレスポンスを取得

        // アクセストークンが存在するか確認
        if (!jsonResponse.access_token) {
            throw new Error('アクセストークンがレスポンスに含まれていません。');
        }

        return jsonResponse.access_token; // アクセストークンを返す

    } catch (error) {
        console.error("アクセストークン取得中にエラーが発生しました:", error);
        throw error; // エラーを再スローして上位に通知
    }
}



// 新しいコマンドを定義
const commands = [
    {
        name: 'setreaction',
        description: '自動リアクションを設定します。',
        options: [
            {
                type: 7, // チャンネル選択
                name: 'channel',
                description: 'リアクションを設定するチャンネル',
                required: true
            },
            {
                type: 3, // 絵文字
                name: 'emojis',
                description: 'リアクションとして追加する絵文字（カンマ区切り）',
                required: true
            },
            {
                type: 3, // トリガーワード
                name: 'trigger',
                description: 'トリガーワード',
                required: true
            }
        ]
    },
    {
        name: 'removereaction',
        description: '自動リアクションの設定を解除します。',
        options: [
            {
                type: 7, 
                name: 'channel',
                description: 'リアクションを解除するチャンネル',
                required: true
            },
            {
                type: 3, 
                name: 'trigger',
                description: '解除するトリガーワード',
                required: true
            }
        ]
    },
    {
        name: 'listreactions',
        description: '現在のリアクション設定を表示します。',
    },
    {
        name: 'help',
        description: 'このボットの使用方法を表示します。',
    },
    {
        name: 'feedback',
        description: 'Reactus開発室でお聞かせください！',
    },
    {
        name: 'backup',
        description: 'バックアップを開始します。',
    },
    {
        name: 'restore',
        description: 'バックアップから復元します。',
    },
    {
        name: 'reacttomessage',
        description: '指定したメッセージにリアクションを追加します。',
        options: [
            {
                type: 3, 
                name: 'message_id',
                description: 'リアクションを追加するメッセージのID',
                required: true
            },
            {
                type: 7, 
                name: 'channel',
                description: 'メッセージが存在するチャンネル',
                required: true
            }
        ]
    },
    {
        name: 'startannounce',
        description: 'アナウンスを開始します。',
        options: [
            {
                type: 3,
                name: 'message',
                description: 'アナウンスメッセージ',
                required: true
            }
        ]
    },
    {
        name: 'stopannounce',
        description: 'アナウンスを停止します。',
    },
    {
        name: 'csvreactions',
        description: '指定したメッセージのリアクションをCSV形式で出力します。',
        options: [
            {
                type: 3, // STRING
                name: 'message_id',
                description: 'リアクションを集計したいメッセージのID',
                required: true
            }
        ]
    },
    {
        name: 'poll',
        description: '投票を作成します',
        options: [
            {
                name: 'question',
                type: 3, // STRING
                description: '投票の質問',
                required: true,
            },
            {
                name: 'options',
                type: 3, // STRING
                description: '投票の選択肢（選択肢同士はカンマ区切り。絵文字と文字列の間には何も無し。あるいは片方のみを入力）',
                required: true,
            },
            {
            name: 'mention',
            type: 3, // STRING
            description: '通知するメンション（@everyone, @here, ロールID）',
            required: false,
        },
        ],
    }
];

// 待機するためのヘルパー関数
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// コマンドの削除を行う関数
async function deleteCommands(commands) {
    for (const command of commands) {
        await deleteCommandWithRetry(command.id); // 正しいコマンドIDを使用
        console.log(`Command ${command.id} deleted successfully.`);
        await wait(2000); // 各削除後に待機（2秒）
    }
}

// コマンドのリトライ削除関数
const deleteCommandWithRetry = async (commandId) => {
    const maxRetries = 5; // 最大リトライ回数
    const baseTimeout = 3000; // ベースのリトライ間隔（3秒）

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to delete command ID: ${commandId} (Attempt ${attempt})`);
            await wait(baseTimeout * attempt); // リクエスト前に待機
            await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, commandId));
            console.log(`Command ${commandId} successfully deleted.`);
            return; // 成功したらリターン
        } catch (error) {
            console.error(`Attempt ${attempt} to delete command ${commandId} failed:`, error.message);
            if (error.message.includes("Unknown application command")) {
                console.log(`Command ${commandId} already deleted or does not exist.`);
                return; // ループを抜ける
            }
            if (attempt === maxRetries) {
                console.log(`Max retries reached for deleting command ${commandId}.`);
            }
            await wait(1000); // リトライ間隔を1秒に設定
        }
    }
};

// コマンドの登録をリトライする関数
async function registerCommandWithRetry(command) {
    const maxRetries = 5;
    const baseTimeout = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to register command: ${command.name} (Attempt ${attempt})`);
            await wait(baseTimeout * attempt); 
            const registerResponse = await rest.post(Routes.applicationCommands(process.env.CLIENT_ID), { body: command });
            console.log(`Successfully registered command: ${registerResponse.name}`);
            await wait(2000); // 登録後に待機（2秒）
            return true; 
        } catch (error) {
            console.error(`Attempt ${attempt} to register command ${command.name} failed:`, error.message);
            if (error.response) {
                console.error('Error response:', error.response.data); 
            }
            if (attempt === maxRetries) {
                console.log(`Max retries reached for registering command ${command.name}.`);
            }
            await wait(1000); // リトライ間隔を1秒に設定
        }
    }
    return false; 
}

// ロックを取得する関数
async function acquireLock() {
    return new Promise((resolve, reject) => {
        console.log("ロックを取得しようとしています...");
        db.get("SELECT is_locked FROM bot_lock WHERE id = 1", (err, row) => {
            if (err) {
                return reject(err);
            }
            if (row && row.is_locked === 1) {
                console.log("ロックが取得されています。");
                return resolve(false);
            } else {
                db.run("INSERT OR REPLACE INTO bot_lock (id, is_locked) VALUES (1, 1)", (err) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("ロックを取得しました。");
                    return resolve(true);
                });
            }
        });
    });
}

// アナウンスを取得する関数
export async function fetchAnnouncement(guildId, channelId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT message FROM announcements WHERE guild_id = ? AND channel_id = ?`, [guildId, channelId], (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row); // アナウンスメッセージを返す
        });
    });
}

// 前回のアナウンスメッセージを削除する関数
async function deletePreviousAnnouncementMessage(channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    // チャンネルのメッセージを10件取得
    const messages = await channel.messages.fetch({ limit: 10 });
    const announcementMessage = messages.find(msg => msg.author.id === client.user.id); // ボットのメッセージを特定

    if (announcementMessage) {
        try {
            await announcementMessage.delete(); // メッセージを削除
            console.log('前回のアナウンスメッセージを削除しました。');
        } catch (error) {
            console.error('アナウンスメッセージの削除中にエラーが発生しました:', error.message);
        }
    }
}

// アナウンスを送信する関数
async function sendAnnouncement(channelId, announcementContent) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        await channel.send(announcementContent); // アナウンスを送信
        console.log('新しいアナウンスを送信しました。');
    } catch (error) {
        console.error('アナウンスの送信中にエラーが発生しました:', error.message);
    }
}


const locks = new Set(); 

// メインの初期化関数
(async () => {
    try {
        const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET; // .envから取得
        const TOKEN = process.env.TOKEN; // .envから取得
        

        // トークンの確認
if (!TOKEN) {
    throw new Error('トークンが設定されていません。');
}

        // Google Sheets APIの初期化
        rest.setToken(process.env.TOKEN); // トークンを設定

        // Discordクライアントの初期化
        try {
            await client.login(process.env.TOKEN);
            console.log('Successfully logged in to Discord!');
        } catch (error) {
            console.error('Login failed:', error);
        }

        const currentCommands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
        console.log('Current registered commands:', currentCommands);

/*
        // コマンドの削除処理
        console.log(`Starting command deletion...`);
        await deleteCommands(currentCommands); // すべてのコマンドを削除

        // コマンドの登録処理
        console.log(`Starting command registration...`);
        for (const command of commands) {
            const success = await registerCommandWithRetry(command);
            if (!success) {
                console.log(`Failed to register command: ${command.name} after multiple attempts.`);
            }
        }

        // コマンド登録完了後の待機時間を設ける
        console.log('Waiting for 3 seconds before retrieving command list...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機

       // コマンドのリストを再取得
console.log('Attempting to retrieve command list...');
try {
    currentCommands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID)); // ここで再代入
    console.log('Successfully retrieved the command list.');

    // 取得したコマンドリストをログに出力
    console.log('Current Command List:');
    currentCommands.forEach(command => {
        console.log(`- ${command.name}: ${command.description}`);
    });
} catch (error) {
    console.error('Error retrieving command list:', error);
}
*/

let isInteractionListenerSet = false; // コマンドリスナーが設定されているかどうかのフラグ

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // バックアップ処理の状態管理
    let isBackupInProgress = false; // バックアップ中かどうかを管理するフラグ

    // 定期バックアップの設定
/*    setInterval(async () => {
        if (isBackupInProgress) {
            console.log('バックアップはすでに進行中です。この間隔をスキップします。');
            return; // バックアップ中は次のバックアップをスキップ
        }

        isBackupInProgress = true; // バックアップ開始フラグ

        console.log('バックアッププロセスを開始します...');
        try {
            const guilds = await client.guilds.fetch(); // サーバーを取得
            const backupPromises = guilds.map(guild => backupToSpreadsheet(guild.id)); // 各サーバーに対してバックアップを非同期で実行
            await Promise.all(backupPromises); // 全てのバックアップ処理が終わるのを待つ
            console.log('すべてのバックアップが成功しました。');
        } catch (error) {
            console.error('バックアッププロセス中にエラーが発生しました:', error);
        } finally {
            isBackupInProgress = false; // バックアップ終了フラグ
            console.log('バックアッププロセスが終了しました。');
        }
    }, 3600000); // 1時間ごとにバックアップを実行
*/
    // メッセージを受信したときのリスナー
    client.on('messageCreate', async (message) => {
       // ボット自身のメッセージを無視する
       if (message.author.id === client.user.id) {
        return; // 自身のメッセージは無視
    }

        async function fetchReactionsData(guildId) {
            return new Promise((resolve, reject) => {
                db.all(`SELECT guild_id, channel_id, emojis, trigger FROM reactions WHERE guild_id = ?`, [guildId], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        }

        const guildId = message.guild.id;
        const channelId = message.channel.id; // メッセージが送信されたチャンネルIDを取得

 // データベースからアナウンスを取得
 const announcement = await fetchAnnouncement(guildId, channelId);
    
 if (announcement) {
     // 前回のアナウンスメッセージを削除
     await deletePreviousAnnouncementMessage(channelId);

     // アナウンスを再送信
     await sendAnnouncement(channelId, announcement.message);
 }

        try {
            // このチャンネルのリアクション設定を取得
            const rows = await fetchReactionsData(guildId);
    
            if (rows.length === 0) {
                return; // 反応設定がない場合は何もしない
            }
    
            // チャンネルIDとトリガーを確認
            for (const row of rows) {
                // チャンネルIDが一致し、メッセージ内容にトリガーが含まれているか確認
                if (row.channel_id === channelId && message.content.includes(row.trigger)) {
                    const emojis = row.emojis.split(',');
                    const fallbackEmojiID = '1290451694085476444'; // 使用するフォールバック絵文字のIDをここに入力

                    for (const emoji of emojis) {
                        try {
                            await message.react(emoji.trim());
                        } catch (reactionError) {
                            console.error('リアクション追加に失敗:', reactionError);
                            try {
                                // リアクション失敗時にフォールバック絵文字でリアクションを追加
                                await message.react(fallbackEmojiID); // フォールバック絵文字IDを使ってリアクション
                            } catch (fallbackError) {
                                console.error('フォールバック絵文字でのリアクションにも失敗:', fallbackError);
                                await message.channel.send('リアクションを追加できませんでした。');
                            }
                        }
                    }
                }
            }
        } catch (error) {
            await message.channel.send('データベースからリアクション設定を取得できませんでした。');
        }

        
        });
    });

    // コマンドリスナーの設定
    if (!isInteractionListenerSet) {
        client.on('interactionCreate', async (interaction) => {
            const requestKey = interaction.commandName; // 一意の識別子

            // すでに処理中であれば無視
            if (locks.has(requestKey)) {
                console.log('このリクエストはすでに処理中です。無視します。');
                return; // 重複リクエストを無視
            }

            // ロックを追加
            locks.add(requestKey);

            try {
                console.log(`インタラクションを処理中: ${interaction.commandName}`);
                await handleInteraction(interaction, db);
            } catch (error) {
                console.error(`インタラクションの処理中にエラーが発生しました: ${interaction.commandName}`, error);
                // 必要に応じてエラーログや通知を行う
            } finally {
                // 処理が終了したら確実にロックを解除
                locks.delete(requestKey);
            }
        });
        isInteractionListenerSet = true; // リスナー設定フラグを更新
    }


} catch (error) {
console.error('初期化中にエラーが発生しました:', error);
}
})();