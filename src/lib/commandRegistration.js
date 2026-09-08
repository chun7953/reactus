import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import config from '../config.js';

export async function syncApplicationCommands(commands) {
    const { token, clientId } = config.discord;
    if (!token || !clientId) {
        throw new Error('TOKEN and CLIENT_ID are required to register Discord commands.');
    }

    const body = [...commands.values()]
        .map(command => command?.data?.toJSON?.())
        .filter(Boolean);

    const rest = new REST({ version: '10' }).setToken(token);
    const result = await rest.put(Routes.applicationCommands(clientId), { body });
    return Array.isArray(result) ? result.length : body.length;
}
