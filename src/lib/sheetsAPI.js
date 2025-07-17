// /src/lib/sheetsAPI.js

import { google } from 'googleapis';
import config from '../config.js'; // configからスプレッドシートIDを読み込むため

let oAuth2Client;

export async function initializeSheetsAPI() {
    // 既に認証済みのクライアントがあれば、それを再利用する
    if (oAuth2Client) {
        // 認証が有効か軽くテスト
        try {
            await oAuth2Client.getAccessToken();
            return { auth: oAuth2Client, sheets: google.sheets({ version: 'v4', auth: oAuth2Client }), spreadsheetId: config.google.spreadsheetId };
        } catch (error) {
            console.warn("Google OAuth token might have expired, re-authenticating...");
            // トークンが切れていた場合は、再認証フローに進む
        }
    }
    
    // Railwayの環境変数から、3つの重要なキーを取得
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
        throw new Error("Google OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) are not fully configured in environment variables.");
    }

    // OAuth2クライアントを新しく作成
    oAuth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'http://localhost' // このリダイレクトURIは認証コード取得時に使ったものなので固定でOK
    );

    // 永久機関の鍵となる「リフレッシュトークン」をセット
    oAuth2Client.setCredentials({
        refresh_token: GOOGLE_REFRESH_TOKEN
    });

    try {
        // 認証が有効か、アクセストークンを取得してテスト
        await oAuth2Client.getAccessToken();
        console.log("✅ Google OAuth2 client authenticated successfully via sheetsAPI.js.");
    } catch (error) {
        console.error("Failed to authenticate Google OAuth2 client:", error);
        throw new Error("Failed to authenticate Google OAuth2 client. Please check your OAuth credentials in Railway variables.");
    }
    
    // 認証済みのクライアントと、それを使ったSheets APIクライアントを返す
    return { 
        auth: oAuth2Client, 
        sheets: google.sheets({ version: 'v4', auth: oAuth2Client }),
        spreadsheetId: config.google.spreadsheetId 
    };
}