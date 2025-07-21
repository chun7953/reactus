import { Client, GatewayIntentBits, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { initializeDatabase } from './db/database.js';
import { startServer } from './web/server.js';
// ★★★ 読み込み元を 'calendarMonitor.js' から 'taskMonitor.js' に変更 ★★★
import { startMonitoring } from './lib/taskMonitor.js'; 
import { initializeCache } from './lib/settingsCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

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

client.commands = new Collection();
client.cooldowns = new Collection(); // ★ この行を追記
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
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }).catch(err => console.error(`Failed to load event ${file}:`, err));
}

(async () => {
    try {
        console.log("--- Initializing Modules ---");
        await initializeDatabase();
        await initializeCache(); // ★ 追記
        startServer();
        startMonitoring(client);
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
// ★★★ ここから4行を追記 ★★★
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());