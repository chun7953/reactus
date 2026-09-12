import { fileURLToPath } from 'node:url';

import { syncApplicationCommands } from '../src/lib/commandRegistration.js';
import { loadCommands } from '../src/lib/moduleLoader.js';

const commandsDirectory = fileURLToPath(new URL('../src/commands/', import.meta.url));

async function main() {
    const client = { commands: new Map() };
    const loaded = await loadCommands(client, commandsDirectory);
    console.log(`Loaded ${loaded} Discord command modules from the canonical command loader.`);

    const synced = await syncApplicationCommands(client.commands);
    console.log(`Successfully synced ${synced} Discord application commands.`);
}

main().catch(error => {
    console.error('Failed to register Discord application commands:', error);
    process.exitCode = 1;
});
