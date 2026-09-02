import assert from 'node:assert/strict';
import test from 'node:test';

import { toggleGiveawayParticipant } from '../src/lib/giveawayParticipation.js';

test('toggleGiveawayParticipant atomically joins a running giveaway', async () => {
    const calls = [];
    const pool = {
        async query(sql, params) {
            calls.push({ sql, params });
            return {
                rows: [{ prize: 'prize', participants: ['existing-user', 'new-user'], winner_count: 1 }],
            };
        },
    };

    const result = await toggleGiveawayParticipant(pool, 'message-1', 'new-user');

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ['message-1', 'new-user']);
    assert.match(calls[0].sql, /UPDATE giveaways/);
    assert.match(calls[0].sql, /array_append/);
    assert.match(calls[0].sql, /array_remove/);
    assert.match(calls[0].sql, /status = 'RUNNING'/);
    assert.equal(result.joined, true);
    assert.deepEqual(result.participants, ['existing-user', 'new-user']);
});

test('toggleGiveawayParticipant reports a successful cancellation', async () => {
    const pool = {
        async query() {
            return { rows: [{ prize: 'prize', participants: [], winner_count: 1 }] };
        },
    };

    const result = await toggleGiveawayParticipant(pool, 'message-1', 'existing-user');

    assert.equal(result.joined, false);
    assert.deepEqual(result.participants, []);
});

test('toggleGiveawayParticipant rejects giveaways that are no longer running', async () => {
    const pool = { async query() { return { rows: [] }; } };

    const result = await toggleGiveawayParticipant(pool, 'message-1', 'user-1');

    assert.equal(result, null);
});
