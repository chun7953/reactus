// src/index.js (修正後・完全版)

import { Client, GatewayIntentBits, Collection, Options } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { startServer } from './web/server.js';
import { getDBPool } from './lib/settingsCache.js';
import { logGlobalError } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
    logGlobalError(error, 'Uncaught Exception');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logGlobalError(reason, 'Unhandled Rejection');
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildEmojisAndStickers,
    ],
    makeCache: Options.cacheWithLimits({
		MessageManager: 0,
		UserManager: {
			maxSize: 50,
			keepOverLimit: user => user.id === client.user.id,
		},
        GuildMemberManager: {
            maxSize: 50,
            keepOverLimit: member => member.id === client.user.id,
        },
	}),
});

client.commands = new Collection();
client.cooldowns = new Collection();
const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));
for (const folder of commandFolders) {
    if (folder.startsWith('_')) continue;
    const commandFiles = fs.readdirSync(path.join(__dirname, 'commands', folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        import(`./commands/${folder}/${file}`).then(commandModule => {
            const command = commandModule.default;
            if (command && command.data) client.commands.set(command.data.name, command);
        }).catch(err => console.error(`Failed to load command ${folder}/${file}:`, err));
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
        await getDBPool(); // DB接続のみを確立
        startServer();
        if (!config.discord.token) {
            throw new Error("Discord token is not configured in environment variables.");
        }
        console.log("Attempting to login to Discord...");
        await client.login(config.discord.token);
    } catch (error) {
        console.error("--- CRITICAL ERROR DURING BOT INITIALIZATION ---");
        console.error(error);
        logGlobalError(error, 'Bot Initialization');
        process.exit(1);
    }
})();

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());