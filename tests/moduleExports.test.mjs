import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const commandRoot = path.resolve('src/commands');
const eventRoot = path.resolve('src/events');

function filesBelow(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesBelow(entryPath);
        return entry.name.endsWith('.js') && !entry.name.startsWith('_') ? [entryPath] : [];
    });
}

test('all command modules expose command data and an execute function', async (t) => {
    for (const file of filesBelow(commandRoot)) {
        await t.test(path.relative(commandRoot, file), async () => {
            const { default: command } = await import(pathToFileURL(file));
            assert.equal(typeof command?.data?.name, 'string');
            assert.equal(typeof command?.execute, 'function');
        });
    }
});

test('all event modules expose an event name and an execute function', async (t) => {
    for (const file of filesBelow(eventRoot)) {
        await t.test(path.relative(eventRoot, file), async () => {
            const { default: event } = await import(pathToFileURL(file));
            assert.ok(typeof event?.name === 'string' || typeof event?.name === 'symbol');
            assert.equal(typeof event?.execute, 'function');
        });
    }
});
