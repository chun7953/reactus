// /src/lib/sheetsAPI.js (修正版)

import { google } from 'googleapis';
import config from '../config.js';

let oAuth2Client;

// ★★★ここからが修正・追記部分です★★★
// ボットがGoogle APIで必要とする権限（スコープ）をリストとして定義します。
// これにより、ボットは常にスプレッドシートの操作とカレンダーの読み取り権限を要求します。
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar.readonly'
];
// ★★★修正・追記はここまでです★★★

export async function initializeSheetsAPI() {
    // 既に認証済みのクライアントがあれば再利用する
    if (oAuth2Client && oAuth2Client.email) {
        try {
            await oAuth2Client.getAccessToken();
            return { auth: oAuth2Client, sheets: google.sheets({ version: 'v4', auth: oAuth2Client }), spreadsheetId: config.google.spreadsheetId };
        } catch (error) {
            console.warn("Google OAuth token might have expired, re-authenticating...");
        }
    }

    // 環境変数からGoogleの認証情報を取得
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
        throw new Error("Google OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) are not fully configured in environment variables.");
    }

    // OAuth2クライアントを初期化
    oAuth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'http://localhost' // リダイレクトURI（トークン取得時のみ利用）
    );

    // 取得済みのリフレッシュトークンと、定義したスコープをクライアントに設定
    oAuth2Client.setCredentials({
        refresh_token: GOOGLE_REFRESH_TOKEN
    });

    try {
        // アクセストークンを取得して認証が有効かテスト
        const { token } = await oAuth2Client.getAccessToken();
        if (!token) throw new Error("Failed to retrieve access token.");

        // 認証情報を使って、このアカウントのメールアドレスを取得します。
        const oauth2 = google.oauth2({
            auth: oAuth2Client,
            version: 'v2'
        });
        const userInfo = await oauth2.userinfo.get();
        // 取得したメールアドレスを、後から使えるようにauthオブジェクトに格納しておきます。
        oAuth2Client.email = userInfo.data.email;

        console.log(`✅ Google OAuth2 client authenticated successfully for ${oAuth2Client.email}`);

    } catch (error) {
        console.error("Failed to authenticate Google OAuth2 client or get user info:", error);
        
        // ★★★エラーメッセージをより具体的にします★★★
        if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
             throw new Error("Failed to authenticate Google OAuth2 client. The refresh token is likely invalid or expired. Please re-generate it with the correct scopes (Sheets and Calendar).");
        }
        throw new Error("Failed to authenticate Google OAuth2 client. Please check your OAuth credentials in Railway variables.");
    }
    
    // 認証済みのクライアントと、それを使ったSheets APIクライアントを返す
    return {
        auth: oAuth2Client, // emailプロパティが追加されたクライアント
        sheets: google.sheets({ version: 'v4', auth: oAuth2Client }),
        spreadsheetId: config.google.spreadsheetId
    };
}