import { Client, GatewayIntentBits, Collection, Options, Events } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import config, { assertRuntimeConfig } from './config.js';
import { startServer } from './web/server.js';
import { closeDBPool, getDBPool } from './lib/settingsCache.js';
import { logGlobalError } from './lib/logger.js';
import { getMonitoringStatus, stopMonitoring } from './lib/taskMonitor.js';
import { createGracefulShutdown } from './lib/gracefulShutdown.js';
import { loadApplicationModules } from './lib/moduleLoader.js';
import { createRuntimeStatus } from './lib/runtimeStatus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const runtimeStatus = createRuntimeStatus();
const webServer = startServer({
    getStatus: () => runtimeStatus.snapshot({ monitoring: getMonitoringStatus() }),
});
const shutdown = createGracefulShutdown({
    client,
    server: webServer,
    stopMonitoring,
    closeDatabase: closeDBPool,
});

let isShuttingDown = false;
function requestShutdown(reason, exitCode = 0) {
    isShuttingDown = true;
    runtimeStatus.markStopping();
    return shutdown(reason, { exitCode });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        void requestShutdown(signal);
    });
}

process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
    logGlobalError(error, 'Uncaught Exception');
    if (!isShuttingDown) void requestShutdown('UNCAUGHT_EXCEPTION', 1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logGlobalError(reason, 'Unhandled Rejection');
    if (!isShuttingDown) void requestShutdown('UNHANDLED_REJECTION', 1);
});

async function bootstrap() {
    let startupComponent = 'config';
    try {
        const warnings = assertRuntimeConfig(config);
        for (const warning of warnings) console.warn(`[Config] ${warning}`);
        runtimeStatus.setComponent('config', 'ready');

        startupComponent = 'http';
        if (!webServer.listening) {
            await new Promise((resolve, reject) => {
                const onListening = () => {
                    webServer.off('error', onError);
                    resolve();
                };
                const onError = (error) => {
                    webServer.off('listening', onListening);
                    reject(error);
                };
                webServer.once('listening', onListening);
                webServer.once('error', onError);
            });
        }
        runtimeStatus.setComponent('http', 'ready');

        startupComponent = 'modules';
        console.log('--- Initializing Bot Modules ---');
        const moduleCounts = await loadApplicationModules(client, {
            commandsDirectory: path.join(__dirname, 'commands'),
            eventsDirectory: path.join(__dirname, 'events'),
        });
        runtimeStatus.setComponent('modules', 'ready');
        console.log(`✅ Loaded ${moduleCounts.commandCount} commands and ${moduleCounts.eventCount} events.`);

        startupComponent = 'database';
        await getDBPool();
        runtimeStatus.setComponent('database', 'ready');

        startupComponent = 'discord';
        console.log('Attempting to login to Discord...');
        const discordReady = client.isReady()
            ? Promise.resolve()
            : new Promise(resolve => client.once(Events.ClientReady, resolve));
        await client.login(config.discord.token);
        await discordReady;
        runtimeStatus.setComponent('discord', 'ready');

        startupComponent = 'monitoring';
        if (!getMonitoringStatus().started) {
            throw new Error('Task monitoring did not start after Discord became ready.');
        }
        runtimeStatus.setComponent('monitoring', 'ready');
        runtimeStatus.markReady();
        console.log('✅ Reactus initialization completed.');
    } catch (error) {
        if (isShuttingDown) return;
        runtimeStatus.markFailed(startupComponent);
        console.error('--- CRITICAL ERROR DURING BOT INITIALIZATION ---');
        console.error(error);
        logGlobalError(error, 'Bot Initialization');
        await requestShutdown('STARTUP_FAILURE', 1);
    }
}

void bootstrap();
