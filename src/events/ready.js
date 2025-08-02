// src/events/ready.js

import { Events } from 'discord.js';
import { startMonitoring } from '../lib/taskMonitor.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        
        // ログインと準備が完全に完了してから、タスク監視を開始する
        startMonitoring(client);
    },
};