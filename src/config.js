import dotenv from 'dotenv';
dotenv.config();

// 環境変数を直接エクスポートする
export default {
    discord: {
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
    },
    web: {
        port: process.env.PORT || 80,
    },
    database: {
        connectionString: process.env.DATABASE_URL,
    },
    sheets: {
        spreadsheetId: process.env.SPREADSHEET_ID,
        credentials: process.env.GOOGLE_SHEETS_CREDENTIALS,
    }
};