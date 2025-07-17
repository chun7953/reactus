import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import dotenv from 'dotenv'; // dotenvをインポート
import fs from 'fs';
dotenv.config(); // 環境変数を読み込む

// Google Sheets APIの初期化
export async function initializeSheetsAPI() {

    const spreadsheetId = process.env.SPREADSHEET_ID; // .envから取得
    console.log(`Using Spreadsheet ID: ${spreadsheetId}`); // 追加したログ
    try {
        // credentials.jsonファイルを読み込む
        const creds = JSON.parse(fs.readFileSync('./sheetcredentials.json', 'utf8'));
        
        // JWTを使って認証を行う
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key.replace(/\\n/g, '\n'), // 改行を適切に扱う
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        // Google Sheets APIのクライアントを作成
        const sheets = google.sheets({ version: 'v4', auth: serviceAccountAuth });

        // 認証情報とsheetsオブジェクトを返す
        return { serviceAccountAuth, sheets, spreadsheetId }; 
    } catch (error) {
        console.error('Error initializing Sheets API:', error);
        throw new Error(`Error initializing Sheets API: ${error.message}\n${error.stack}`); // エラーを詳細にスロー
    }
}