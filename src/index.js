// /src/index.js

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { initializeDatabase } from './db/database.js';
import { startServer } from './web/server.js';
import { startMonitoring } from './lib/calendarMonitor.js'; // ★★★この行を追記★★★


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Unhandled Error Handlers ---
process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Client Initialization ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildEmojisAndStickers,
    ]
});

// --- Command and Event Handlers ---
client.commands = new Collection();
const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));
for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(__dirname, 'commands', folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        import(`./commands/${folder}/${file}`).then(commandModule => {
            const command = commandModule.default;
            if (command && command.data) client.commands.set(command.data.name, command);
        }).catch(err => console.error(`Failed to load command ${file}:`, err));
    }
}
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    import(`./events/${file}`).then(eventModule => {
        const event = eventModule.default;
        const dbInstance = initializeDatabase();
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, dbInstance));
        } else {
            client.on(event.name, (...args) => event.execute(...args, dbInstance));
        }
    }).catch(err => console.error(`Failed to load event ${file}:`, err));
}

// --- Main Execution ---
(async () => {
    try {
        console.log("--- Initializing Modules ---");

        // 1. Initialize Database
        await initializeDatabase();

        // 2. Start Web Server
        startServer();

        // 3. Start Calendar Monitoring
        startMonitoring(client); // ★★★この行を追記★★★

        // 4. Login to Discord
        if (!config.discord.token) {
            throw new Error("Discord token is not configured in environment variables.");
        }
        console.log("Attempting to login to Discord...");
        await client.login(config.discord.token);

    } catch (error) {
        console.error("--- CRITICAL ERROR DURING BOT INITIALIZATION ---");
        console.error(error);
        process.exit(1);
    }
})();