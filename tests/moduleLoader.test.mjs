import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadCommands, loadEvents } from '../src/lib/moduleLoader.js';

test('module loader awaits and registers commands in deterministic order', async (t) => {
    const root = path.join(tmpdir(), `reactus-module-loader-${process.pid}-${Date.now()}`);
    const commandRoot = path.join(root, 'commands');
    await mkdir(path.join(commandRoot, 'utility'), { recursive: true });
    await writeFile(path.join(commandRoot, 'utility', 'zeta.js'), '');
    await writeFile(path.join(commandRoot, 'utility', 'alpha.js'), '');
    t.after(() => rm(root, { recursive: true, force: true }));

    const imports = [];
    const client = { commands: new Map() };
    const count = await loadCommands(client, commandRoot, {
        importModule: async (specifier) => {
            const name = path.basename(new URL(specifier).pathname, '.js');
            imports.push(name);
            await Promise.resolve();
            return { default: { data: { name }, execute() {} } };
        },
    });

    assert.equal(count, 2);
    assert.deepEqual(imports, ['alpha', 'zeta']);
    assert.deepEqual([...client.commands.keys()], ['alpha', 'zeta']);
});

test('module loader registers once and recurring events correctly', async (t) => {
    const root = path.join(tmpdir(), `reactus-event-loader-${process.pid}-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'once.js'), '');
    await writeFile(path.join(root, 'repeat.js'), '');
    t.after(() => rm(root, { recursive: true, force: true }));

    const registrations = [];
    const client = {
        once: (name, execute) => registrations.push({ type: 'once', name, execute }),
        on: (name, execute) => registrations.push({ type: 'on', name, execute }),
    };
    const count = await loadEvents(client, root, {
        importModule: async (specifier) => {
            const name = path.basename(new URL(specifier).pathname, '.js');
            return { default: { name, once: name === 'once', execute() {} } };
        },
    });

    assert.equal(count, 2);
    assert.deepEqual(registrations.map(({ type, name }) => ({ type, name })), [
        { type: 'once', name: 'once' },
        { type: 'on', name: 'repeat' },
    ]);
});
