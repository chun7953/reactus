import { google } from 'googleapis';
import config from '../config.js'; // ★ configから直接読み込む

let auth;
let sheets;

export async function initializeSheetsAPI() {
    if (auth && sheets) {
        return { auth, sheets, spreadsheetId: config.sheets.spreadsheetId };
    }

    const credentialsJson = config.sheets.credentials;
    if (!credentialsJson) {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS environment variable not set.');
    }

    const credentials = JSON.parse(credentialsJson);

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
    
    auth.email = credentials.client_email;

    console.log(`✅ Google Service Account authenticated successfully for ${auth.email}`);

    return { auth, sheets, spreadsheetId: config.sheets.spreadsheetId };
}