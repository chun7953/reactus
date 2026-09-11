import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('package metadata describes the current Reactus product and official sources', () => {
    assert.match(packageJson.description, /Discord automation bot/);
    assert.doesNotMatch(packageJson.description, /manages automatic reactions/i);
    assert.equal(packageJson.homepage, 'https://reactus.fly.dev/');
    assert.deepEqual(packageJson.repository, {
        type: 'git',
        url: 'https://github.com/chun7953/reactus.git',
    });

    for (const keyword of [
        'discord-bot',
        'discord-automation',
        'google-calendar',
        'scheduled-posts',
        'recurring-posts',
        'giveaway',
        'automatic-reactions',
        'web-admin',
    ]) {
        assert.ok(packageJson.keywords.includes(keyword), `missing package keyword: ${keyword}`);
    }
});
