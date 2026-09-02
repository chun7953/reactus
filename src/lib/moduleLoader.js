import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

function sortedJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_'))
        .map(entry => entry.name)
        .sort();
}

export async function loadCommands(client, commandsDirectory, {
    importModule = specifier => import(specifier),
} = {}) {
    const folders = fs.readdirSync(commandsDirectory, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
        .map(entry => entry.name)
        .sort();

    let loaded = 0;
    for (const folder of folders) {
        const folderPath = path.join(commandsDirectory, folder);
        for (const file of sortedJavaScriptFiles(folderPath)) {
            const fileUrl = pathToFileURL(path.join(folderPath, file)).href;
            const { default: command } = await importModule(fileUrl);
            if (!command?.data?.name || typeof command.execute !== 'function') {
                throw new TypeError(`Invalid command module: ${folder}/${file}`);
            }
            if (client.commands.has(command.data.name)) {
                throw new Error(`Duplicate command name: ${command.data.name}`);
            }
            client.commands.set(command.data.name, command);
            loaded += 1;
        }
    }
    return loaded;
}

export async function loadEvents(client, eventsDirectory, {
    importModule = specifier => import(specifier),
} = {}) {
    let loaded = 0;
    for (const file of sortedJavaScriptFiles(eventsDirectory)) {
        const fileUrl = pathToFileURL(path.join(eventsDirectory, file)).href;
        const { default: event } = await importModule(fileUrl);
        if (!event?.name || typeof event.execute !== 'function') {
            throw new TypeError(`Invalid event module: ${file}`);
        }

        const register = event.once ? client.once.bind(client) : client.on.bind(client);
        register(event.name, (...args) => event.execute(...args));
        loaded += 1;
    }
    return loaded;
}

export async function loadApplicationModules(client, { commandsDirectory, eventsDirectory } = {}) {
    const [commandCount, eventCount] = await Promise.all([
        loadCommands(client, commandsDirectory),
        loadEvents(client, eventsDirectory),
    ]);
    return { commandCount, eventCount };
}
