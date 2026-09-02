import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertRuntimeConfig,
    buildConfig,
    parsePort,
    validateRuntimeConfig,
} from '../src/config.js';

function encodedCredentials() {
    return Buffer.from(JSON.stringify({
        client_email: 'bot@example.test',
        private_key: 'secret-key',
    })).toString('base64');
}

test('buildConfig reads the runtime port and required services', () => {
    const config = buildConfig({
        TOKEN: 'discord-token',
        DATABASE_URL: 'postgres://database',
        PORT: '9090',
        GOOGLE_SHEETS_CREDENTIALS: encodedCredentials(),
        SPREADSHEET_ID: 'sheet-id',
    });

    assert.equal(config.web.port, 9090);
    assert.deepEqual(assertRuntimeConfig(config), []);
});

test('runtime validation reports required settings without exposing values', () => {
    const result = validateRuntimeConfig(buildConfig({}));

    assert.deepEqual(result.errors, ['TOKEN is required.', 'DATABASE_URL is required.']);
    assert.equal(result.warnings.length, 2);
});

test('runtime validation rejects malformed Google credentials before startup', () => {
    const config = buildConfig({
        TOKEN: 'discord-token',
        DATABASE_URL: 'postgres://database',
        GOOGLE_SHEETS_CREDENTIALS: Buffer.from('{}').toString('base64'),
        SPREADSHEET_ID: 'sheet-id',
    });

    assert.throws(() => assertRuntimeConfig(config), /GOOGLE_SHEETS_CREDENTIALS/);
});

test('parsePort rejects invalid network ports', () => {
    assert.equal(parsePort(undefined), 8080);
    assert.throws(() => parsePort('0'), /PORT/);
    assert.throws(() => parsePort('not-a-number'), /PORT/);
});
