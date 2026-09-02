import assert from 'node:assert/strict';
import test from 'node:test';

import {
    claimFinishedGiveaway,
    completeClaimedGiveaway,
    failClaimedGiveaway,
    recoverStaleGiveawayClaims,
} from '../src/lib/giveawayLifecycle.js';

test('claimFinishedGiveaway atomically claims only a due running giveaway', async () => {
    const calls = [];
    const giveaway = { message_id: 'message-1', status: 'ENDING', participants: ['user-1'] };
    const pool = {
        async query(sql, params) {
            calls.push({ sql, params });
            return { rows: [giveaway] };
        },
    };

    const result = await claimFinishedGiveaway(pool, 'message-1');

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ['message-1']);
    assert.match(calls[0].sql, /SET status = 'ENDING'/);
    assert.match(calls[0].sql, /status = 'RUNNING'/);
    assert.match(calls[0].sql, /end_time <= NOW\(\)/);
    assert.equal(result, giveaway);
});

test('claimFinishedGiveaway returns null when another worker already claimed it', async () => {
    const pool = { async query() { return { rows: [] }; } };

    assert.equal(await claimFinishedGiveaway(pool, 'message-1'), null);
});

test('completeClaimedGiveaway completes only an active claim', async () => {
    const calls = [];
    const pool = { async query(sql, params) { calls.push({ sql, params }); return { rowCount: 1 }; } };

    await completeClaimedGiveaway(pool, 'message-1', ['winner-1']);

    assert.deepEqual(calls[0].params, [['winner-1'], 'message-1']);
    assert.match(calls[0].sql, /SET status = 'ENDED'/);
    assert.match(calls[0].sql, /status = 'ENDING'/);
});

test('failClaimedGiveaway fails only an active claim', async () => {
    const calls = [];
    const pool = { async query(sql, params) { calls.push({ sql, params }); return { rowCount: 1 }; } };

    await failClaimedGiveaway(pool, 'message-1');

    assert.deepEqual(calls[0].params, ['message-1']);
    assert.match(calls[0].sql, /SET status = 'ERRORED'/);
    assert.match(calls[0].sql, /status = 'ENDING'/);
});

test('recoverStaleGiveawayClaims retries interrupted claims after a safety window', async () => {
    const calls = [];
    const pool = { async query(sql) { calls.push(sql); return { rowCount: 1 }; } };

    await recoverStaleGiveawayClaims(pool);

    assert.match(calls[0], /SET status = 'RUNNING'/);
    assert.match(calls[0], /status = 'ENDING'/);
    assert.match(calls[0], /INTERVAL '15 minutes'/);
});
