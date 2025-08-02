// src/events/ready.js

import { Events } from 'discord.js';
import { startMonitoring } from '../lib/taskMonitor.js';
import { startServer } from '../web/server.js'; // startServerをインポート

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        
        // タスク監視を開始
        startMonitoring(client);

        // Discordボットの準備が整ったこのタイミングでWebサーバーを起動
        startServer();
    },
};