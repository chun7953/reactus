import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;

function commandFiles(root) {
    return fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
        .flatMap(entry => {
            const directory = path.join(root, entry.name);
            return fs.readdirSync(directory, { withFileTypes: true })
                .filter(file => file.isFile() && file.name.endsWith('.js') && !file.name.startsWith('_'))
                .map(file => path.join(directory, file.name));
        })
        .sort();
}

function assertRequiredOptionsComeFirst(options = [], context = 'command') {
    const valueOptions = options.filter(option => option.type !== SUBCOMMAND && option.type !== SUBCOMMAND_GROUP);
    let optionalSeen = false;
    for (const option of valueOptions) {
        if (option.required === true) {
            assert.equal(optionalSeen, false, `${context}: required option ${option.name} appears after an optional option`);
        } else {
            optionalSeen = true;
        }
    }

    for (const option of options) {
        if (option.options?.length) {
            assertRequiredOptionsComeFirst(option.options, `${context} ${option.name}`);
        }
    }
}

test('all Discord application command payloads keep required options before optional options', async () => {
    const commandsRoot = path.resolve('src/commands');
    for (const file of commandFiles(commandsRoot)) {
        const { default: command } = await import(pathToFileURL(file).href);
        const json = command?.data?.toJSON?.();
        assert.ok(json?.name, `invalid command module: ${file}`);
        assertRequiredOptionsComeFirst(json.options, json.name);
    }
});
