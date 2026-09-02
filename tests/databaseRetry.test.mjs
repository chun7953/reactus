import test from 'node:test';
import assert from 'node:assert/strict';

import { queryWithRetry } from '../src/db/database.js';

test('queryWithRetry returns immediately after a successful query', async () => {
    const expected = { rows: [{ now: 'ok' }] };
    let calls = 0;
    const db = {
        async query(sql) {
            calls += 1;
            assert.equal(sql, 'SELECT NOW()');
            return expected;
        },
    };

    const result = await queryWithRetry(db, 'SELECT NOW()', {
        attempts: 3,
        baseDelayMs: 0,
        onRetry: () => assert.fail('retry should not run'),
    });

    assert.equal(result, expected);
    assert.equal(calls, 1);
});

test('queryWithRetry retries transient failures', async () => {
    let calls = 0;
    const retries = [];
    const db = {
        async query() {
            calls += 1;
            if (calls < 3) throw new Error(`temporary failure ${calls}`);
            return { rows: [] };
        },
    };

    await queryWithRetry(db, 'SELECT NOW()', {
        attempts: 3,
        baseDelayMs: 0,
        onRetry: ({ attempt }) => retries.push(attempt),
    });

    assert.equal(calls, 3);
    assert.deepEqual(retries, [1, 2]);
});

test('queryWithRetry rethrows the last failure after all attempts', async () => {
    const errors = [new Error('first'), new Error('last')];
    let calls = 0;
    const db = {
        async query() {
            const error = errors[calls];
            calls += 1;
            throw error;
        },
    };

    await assert.rejects(
        queryWithRetry(db, 'SELECT NOW()', {
            attempts: 2,
            baseDelayMs: 0,
            onRetry: () => {},
        }),
        error => error === errors[1],
    );
    assert.equal(calls, 2);
});
