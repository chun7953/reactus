import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function registerCommands() {
    const { token, clientId } = config.discord;
    if (!token || !clientId) {
        console.error("TOKEN and CLIENT_ID must be configured in .env file.");
        return;
    }
    const commands = [];
    const commandFolders = fs.readdirSync(path.join(__dirname, '..'));

    for (const folder of commandFolders) {
        // Skip private folders like '_register.js' parent folder
        if (folder.startsWith('_') || folder === 'admin') continue;

        const commandFiles = fs.readdirSync(path.join(__dirname, '..', folder)).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const commandModule = await import(`../${folder}/${file}`);
                const command = commandModule.default;
                if (command && command.data) {
                    commands.push(command.data.toJSON());
                }
            } catch (error) {
                console.error(`Error loading command at ${folder}/${file}:`, error);
            }
        }
    }
    
    // Also load admin commands
    const adminFiles = fs.readdirSync(path.join(__dirname, '..', 'admin')).filter(file => file.endsWith('.js') && !file.startsWith('_'));
     for (const file of adminFiles) {
        try {
            const commandModule = await import(`../admin/${file}`);
            const command = commandModule.default;
            if (command && command.data) {
                commands.push(command.data.toJSON());
            }
        } catch (error) {
            console.error(`Error loading admin command at ${file}:`, error);
        }
    }


    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
}

registerCommands();