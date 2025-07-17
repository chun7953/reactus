import dotenv from 'dotenv';
dotenv.config();

export default {
    // Discord Bot Settings
    discord: {
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
    },
    // Google API Settings
    google: {
        spreadsheetId: process.env.SPREADSHEET_ID,
        credentialsPath: './sheetcredentials.json',
    },
    // Web Server Settings
    web: {
        port: process.env.PORT || 80,
        redirectUri: process.env.REDIRECT_URI,
    },
    // Database Settings
    database: {
        connectionString: process.env.DATABASE_URL,
    },
};