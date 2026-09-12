import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadCommands } from '../src/lib/moduleLoader.js';

const packagePath = new URL('../package.json', import.meta.url);
const scriptPath = new URL('../scripts/register-commands.mjs', import.meta.url);
const retiredScriptPath = new URL('../src/commands/admin/_register.js', import.meta.url);
const commandsDirectory = fileURLToPath(new URL('../src/commands/', import.meta.url));

test('manual command registration delegates to canonical loader and sync owner', async () => {
    const [packageSource, scriptSource] = await Promise.all([
        readFile(packagePath, 'utf8'),
        readFile(scriptPath, 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource);

    assert.equal(packageJson.scripts['register-commands'], 'node scripts/register-commands.mjs');
    assert.match(scriptSource, /loadCommands/);
    assert.match(scriptSource, /syncApplicationCommands/);
    assert.doesNotMatch(scriptSource, /new REST|Routes\.applicationCommands|readdirSync/);

    await assert.rejects(
        () => access(retiredScriptPath),
        error => error?.code === 'ENOENT',
    );
});

test('canonical loader accepts the real command tree used by manual sync', async () => {
    const client = { commands: new Map() };
    const loaded = await loadCommands(client, commandsDirectory);

    assert.equal(loaded, client.commands.size);
    assert.ok(loaded > 0);
    assert.ok(client.commands.has('reactus'));
    assert.ok(client.commands.has('verify-calendar'));
});
