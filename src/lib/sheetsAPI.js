// /src/lib/sheetsAPI.js (最終修正版)

import { google } from 'googleapis';
// config.js の読み込みを削除

let oAuth2Client;

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar.readonly'
];

export async function initializeSheetsAPI() {
    if (oAuth2Client && oAuth2Client.email) {
        try {
            await oAuth2Client.getAccessToken();
            // SPREADSHEET_ID を直接環境変数から取得
            return { auth: oAuth2Client, sheets: google.sheets({ version: 'v4', auth: oAuth2Client }), spreadsheetId: process.env.SPREADSHEET_ID };
        } catch (error) {
            console.warn("Google OAuth token might have expired, re-authenticating...");
        }
    }

    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
        throw new Error("Google OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) are not fully configured in environment variables.");
    }
    
    // SPREADSHEET_ID が設定されているかどうかもチェック
    if (!process.env.SPREADSHEET_ID) {
        throw new Error("SPREADSHEET_ID is not configured in environment variables.");
    }

    oAuth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'http://localhost'
    );

    oAuth2Client.setCredentials({
        refresh_token: GOOGLE_REFRESH_TOKEN
    });

    try {
        const { token } = await oAuth2Client.getAccessToken();
        if (!token) throw new Error("Failed to retrieve access token.");

        const oauth2 = google.oauth2({
            auth: oAuth2Client,
            version: 'v2'
        });
        const userInfo = await oauth2.userinfo.get();
        oAuth2Client.email = userInfo.data.email;

        console.log(`✅ Google OAuth2 client authenticated successfully for ${oAuth2Client.email}`);

    } catch (error) {
        console.error("Failed to authenticate Google OAuth2 client or get user info:", error);
        if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
             throw new Error("Failed to authenticate Google OAuth2 client. The refresh token is invalid or expired. Please re-generate it with the correct scopes (Sheets and Calendar).");
        }
        throw new Error("Failed to authenticate Google OAuth2 client. Please check your OAuth credentials in Railway variables.");
    }
    
    return {
        auth: oAuth2Client,
        sheets: google.sheets({ version: 'v4', auth: oAuth2Client }),
        // SPREADSHEET_ID を直接環境変数から取得
        spreadsheetId: process.env.SPREADSHEET_ID
    };
}