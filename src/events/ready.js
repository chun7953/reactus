// /src/events/ready.js (最終版)
import { Events } from 'discord.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        // これが、あなたが見たかったログです！
        console.log(`Ready! Logged in as ${client.user.tag}`);
    },
};