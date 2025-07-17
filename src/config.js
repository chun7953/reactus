// /src/config.js (クリーンアップ版)

import dotenv from 'dotenv';
dotenv.config();

export default {
    // Discord Bot Settings
    discord: {
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
    },
    // Web Server Settings
    web: {
        port: process.env.PORT || 80,
    },
    // Database Settings
    database: {
        connectionString: process.env.DATABASE_URL,
    },
};