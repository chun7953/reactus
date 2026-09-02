import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production container runs Node directly so Fly signals reach the bot', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8');

    assert.match(dockerfile, /^CMD \["node", "src\/index\.js"\]$/m);
    assert.doesNotMatch(dockerfile, /^CMD \["npm", "start"\]$/m);
});

test('Fly checks application readiness instead of only accepting a TCP connection', async () => {
    const config = await readFile('fly.toml', 'utf8');

    assert.match(config, /^\[\[http_service\.checks\]\]$/m);
    assert.match(config, /^\s*path = "\/readyz"$/m);
    assert.doesNotMatch(config, /^\[\[tcp_checks\]\]$/m);
});
