import { google } from 'googleapis';

let auth;
let sheets;

export async function initializeSheetsAPI() {
    // 既に認証済みなら再利用
    if (auth && sheets) {
        return { auth, sheets, spreadsheetId: process.env.SPREADSHEET_ID };
    }

    // 環境変数からJSONキーファイルの内容を取得
    const credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
    if (!credentialsJson) {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS environment variable not set.');
    }

    const credentials = JSON.parse(credentialsJson);

    // サービスアカウント情報を使って認証
    auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
        },
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/calendar.readonly',
        ],
    });

    const authClient = await auth.getClient();
    sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // サービスアカウントには固定のメールアドレスがあるので、それをauthオブジェクトに格納しておく
    auth.email = credentials.client_email;

    console.log(`✅ Google Service Account authenticated successfully for ${auth.email}`);

    return { auth, sheets, spreadsheetId: process.env.SPREADSHEET_ID };
}