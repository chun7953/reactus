import dotenv from 'dotenv';
dotenv.config();
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { sheets } from 'googleapis/build/src/apis/sheets/index.js'; 

// SQLiteデータベースの設定
const dbDirectory = './data';
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory);
}

const db = new sqlite3.Database(path.join(dbDirectory, 'reactionSettings.sqlite'), (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// スプレッドシートからリアクションデータを取得する関数
async function fetchReactionsData(guildId) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT guild_id, channel_id, emojis, trigger FROM reactions WHERE guild_id = ?`, [guildId], (err, rows) => {
            if (err) {
                console.error('Error fetching reactions data:', `${err.message}\n${err.stack}`);
                return reject(err);
            }
            resolve(rows);
        });
    });
}

export async function backupToSpreadsheet(guildId) {
    console.log('バックアップ処理を開始します...');
    const startTime = Date.now();

    try {
        // Sheets APIの初期化
        const { serviceAccountAuth, sheets, spreadsheetId } = await initializeSheetsAPI();
        const sheetName = `Guild_${guildId}`; // ギルドごとのシート名を作成

        // シートの存在を確認
        const sheetResponse = await sheets.spreadsheets.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
        });

        const sheetExists = sheetResponse.data.sheets.some(sheet => sheet.properties.title === sheetName);

        // シートが存在しない場合、新しいシートを作成
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                auth: serviceAccountAuth,
                spreadsheetId: spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName,
                            },
                        },
                    }],
                },
            });
            console.log(`シート ${sheetName} を作成しました。`);
        }

        // 取得するデータの確認
        const data = await fetchReactionsData(guildId);
        if (data.length === 0) {
            console.log('バックアップするデータがありません。');
            return;
        }

        // ヘッダー行の存在を確認
        const getResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:A1`,
        });

        // ヘッダー行が存在しない場合、追加
        if (!getResponse.data || !getResponse.data.values || getResponse.data.values.length === 0) {
            console.log('ヘッダー行が存在しないため、新しいヘッダーを追加します。');
            const headerValues = [['Guild ID', 'Channel ID', 'Emojis', 'Trigger']];
            await sheets.spreadsheets.values.append({
                auth: serviceAccountAuth,
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A1`,
                valueInputOption: 'RAW',
                resource: { values: headerValues },
            });
        }

        // 既存データを取得
        const existingResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:D`,
        });

        const existingRows = existingResponse.data.values || [];

        // 書き込むデータのフォーマット
        const valuesToAppend = data.map(row => [row.guild_id, row.channel_id, row.emojis, row.trigger]);

        // スプレッドシートにデータを追加または更新
        for (const row of valuesToAppend) {
            try {
                await insertReactionData(row[0], row[1], row[2], row[3]); // データをSQLiteに挿入
            } catch (insertError) {
                console.error('Error inserting reaction data into SQLite:', insertError.message);
            }
        }
        
        // スプレッドシートのデータをクリアして新しいデータを書き込む
        const resource = { values: valuesToAppend };
        await sheets.spreadsheets.values.clear({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:D`,
        });
        await sheets.spreadsheets.values.update({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            resource,
        });

        console.log(`${valuesToAppend.length}件のデータが追加されました。`);

        const endTime = Date.now();
        console.log(`バックアップ処理が完了しました。処理時間: ${endTime - startTime}ms`);
    } catch (error) {
        console.error('バックアップ中にエラーが発生しました:', error.message);
    }
}

// スプレッドシートから不要なリアクションデータを削除する関数
export async function removeReactionFromSpreadsheet(guildId, channelId, trigger) {
    try {
        // Sheets APIの初期化
        const { serviceAccountAuth, sheets, spreadsheetId } = await initializeSheetsAPI();
        const sheetName = `Guild_${guildId}`; // ギルドごとのシート名を作成

        // スプレッドシートのデータを取得
        const getResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:D`,
        });

        const rows = getResponse.data.values || [];
        const newRows = rows.filter(row => !(row[0] === guildId && row[1] === channelId && row[3] === trigger));

        // スプレッドシートをクリアして新しいデータを書き込む
        const resource = { values: newRows };

        await sheets.spreadsheets.values.clear({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:D`,
        });

        await sheets.spreadsheets.values.update({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            resource,
        });

        console.log('スプレッドシートから不要なリアクションデータが削除されました。');
    } catch (error) {
        console.error('Error removing reaction from spreadsheet:', error.message);
    }
}

// データベースにリアクションデータを挿入または更新する関数
async function insertReactionData(guild_id, channel_id, emojis, trigger) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO reactions (guild_id, channel_id, emojis, trigger) 
            VALUES (?, ?, ?, ?) 
            ON CONFLICT(guild_id, channel_id, trigger) 
            DO UPDATE SET emojis = excluded.emojis
        `;
        db.run(sql, [guild_id, channel_id, emojis, trigger], function(err) {
            if (err) {
                return reject(err);
            }
            resolve(this.lastID); // 挿入された行のIDを返す
        });
    });
}
// スプレッドシートからバックアップを復元する関数
export async function restoreFromSpreadsheet(guildId) {
    console.log('復元処理を開始します...');
    const startTime = Date.now();

    try {
        // Sheets APIの初期化
        const { serviceAccountAuth, sheets, spreadsheetId } = await initializeSheetsAPI();
        const reactionsSheetName = `Guild_${guildId}`; // ギルドごとのシート名を作成
        const announcementsSheetName = `Announcements_${guildId}`; // アナウンス用シート名を作成

        // スプレッドシートからリアクションデータを取得
        const reactionsResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${reactionsSheetName}!A2:D`, // ヘッダーを除いたデータ範囲を指定
        });

        const reactionRows = reactionsResponse.data.values || [];
        if (reactionRows.length > 0) {
            // トランザクションを開始
            await new Promise((resolve, reject) => {
                db.serialize(async () => {
                    db.run('BEGIN TRANSACTION');

                    try {
                        const insertReactionPromises = reactionRows.map(row => {
                            const [guild_id, channel_id, emojis, trigger] = row;
                            return insertReactionData(guild_id, channel_id, emojis, trigger); // データをSQLiteに挿入
                        });

                        // 全ての挿入を待機
                        await Promise.all(insertReactionPromises);
                        db.run('COMMIT');
                        console.log(`リアクションの復元処理が完了しました。`);
                        resolve();
                    } catch (error) {
                        db.run('ROLLBACK');
                        console.error('リアクションの挿入中にエラーが発生しました:', error.message);
                        reject(error);
                    }
                });
            });
        } else {
            console.log('復元するリアクションデータがありません。');
        }

        // スプレッドシートからアナウンスデータを取得
        const announcementsResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${announcementsSheetName}!A2:C`, // ヘッダーを除いたデータ範囲を指定
        });

        const announcementRows = announcementsResponse.data.values || [];
        if (announcementRows.length > 0) {
            // アナウンスデータの復元
            await new Promise((resolve, reject) => {
                db.serialize(async () => {
                    db.run('BEGIN TRANSACTION');

                    try {
                        const insertAnnouncementPromises = announcementRows.map(row => {
                            const [guild_id, channel_id, message] = row;
                            return saveAnnouncement(guild_id, channel_id, message); // データをSQLiteに挿入
                        });

                        // 全ての挿入を待機
                        await Promise.all(insertAnnouncementPromises);
                        db.run('COMMIT');
                        console.log(`アナウンスの復元処理が完了しました。`);
                        resolve();
                    } catch (error) {
                        db.run('ROLLBACK');
                        console.error('アナウンスの挿入中にエラーが発生しました:', error.message);
                        reject(error);
                    }
                });
            });
        } else {
            console.log('復元するアナウンスデータがありません。');
        }

        const endTime = Date.now();
        console.log(`復元処理が完了しました。処理時間: ${endTime - startTime}ms`);
    } catch (error) {
        console.error('復元中にエラーが発生しました:', error.message);
    }
}

export async function saveAnnouncement(guildId, channelId, messageContent) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO announcements (guild_id, channel_id, message)
            VALUES (?, ?, ?)
            ON CONFLICT(guild_id, channel_id) 
            DO UPDATE SET message = excluded.message
        `;
        db.run(sql, [guildId, channelId, messageContent], function(err) {
            if (err) {
                return reject(err);
            }
            resolve(this.lastID); // 挿入された行のIDを返す
        });
    });
}

export async function backupAnnouncementToSpreadsheet(guildId, channelId, messageContent) {
    console.log('アナウンスのバックアップ処理を開始します...');

    try {
        const { serviceAccountAuth, sheets, spreadsheetId } = await initializeSheetsAPI();
        const sheetName = `Announcements_${guildId}`;

        // シートの存在を確認
        const sheetResponse = await sheets.spreadsheets.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
        });

        const sheetExists = sheetResponse.data.sheets.some(sheet => sheet.properties.title === sheetName);

        // シートが存在しない場合、新しいシートを作成
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                auth: serviceAccountAuth,
                spreadsheetId: spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName,
                            },
                        },
                    }],
                },
            });
            console.log(`シート ${sheetName} を作成しました。`);
        }

        // 既存データの確認
        const existingResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:C`, // ヘッダーを除いたデータ範囲を指定
        });

        const existingRows = existingResponse.data.values || [];
        const existingRowIndex = existingRows.findIndex(row => row[0] === guildId && row[1] === channelId);

        const resource = {
            values: [[guildId, channelId, messageContent]] // ギルドID、チャンネルID、メッセージ内容を含む
        };

        if (existingRowIndex !== -1) {
            // 既存行がある場合、更新
            await sheets.spreadsheets.values.update({
                auth: serviceAccountAuth,
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A${existingRowIndex + 2}:C${existingRowIndex + 2}`, // 更新する行の範囲
                valueInputOption: 'RAW',
                resource,
            });
            console.log(`アナウンスが更新されました: ${channelId}`);
        } else {
            // 新しい行を追加
            await sheets.spreadsheets.values.append({
                auth: serviceAccountAuth,
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A1`, // データを追加する範囲
                valueInputOption: 'RAW',
                resource,
            });
            console.log(`アナウンスが追加されました: ${channelId}`);
        }

        console.log('アナウンスのバックアップが完了しました。');
    } catch (error) {
        console.error('バックアップ中にエラーが発生しました:', error.message);
    }
}

async function fetchAnnouncement(guildId, channelId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM announcements WHERE guild_id = ? AND channel_id = ?`, [guildId, channelId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

export async function deleteAnnouncement(guildId, channelId) {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM announcements WHERE guild_id = ? AND channel_id = ?`;
        db.run(sql, [guildId, channelId], function(err) {
            if (err) {
                return reject(err);
            }
            resolve(this.changes); // 削除された行数を返す
        });
    });
}

export async function removeAnnouncementFromSpreadsheet(guildId, channelId) {
    try {
        const { serviceAccountAuth, sheets, spreadsheetId } = await initializeSheetsAPI();
        const sheetName = `Announcements_${guildId}`;

        // スプレッドシートのデータを取得
        const getResponse = await sheets.spreadsheets.values.get({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:C`, // ヘッダーを除いたデータ範囲を指定
        });

        const rows = getResponse.data.values || [];
        const newRows = rows.filter(row => !(row[0] === guildId && row[1] === channelId));

        // スプレッドシートをクリアして新しいデータを書き込む
        const resource = { values: newRows };

        await sheets.spreadsheets.values.clear({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2:C`,
        });

        await sheets.spreadsheets.values.update({
            auth: serviceAccountAuth,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            resource,
        });

        console.log('スプレッドシートからアナウンスデータが削除されました。');
    } catch (error) {
        console.error('スプレッドシートからの削除中にエラーが発生しました:', error.message);
    }
}
