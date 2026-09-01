import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInsertBatches } from '../src/db/migrateDatabase.js';

test('buildInsertBatches parameterizes values and preserves arrays', () => {
    const table = {
        name: 'giveaways',
        columns: ['message_id', 'participants'],
    };
    const rows = [
        { message_id: 'message-1', participants: ['user-1', 'user-2'] },
        { message_id: 'message-2', participants: [] },
    ];

    const [statement] = buildInsertBatches(table, rows);
    assert.equal(
        statement.query,
        'INSERT INTO public."giveaways" ("message_id", "participants") VALUES ($1, $2), ($3, $4)',
    );
    assert.deepEqual(statement.values, ['message-1', ['user-1', 'user-2'], 'message-2', []]);
    assert.equal(statement.query.includes('message-1'), false);
});

test('buildInsertBatches splits large copies into bounded batches', () => {
    const table = { name: 'reactions', columns: ['guild_id'] };
    const statements = buildInsertBatches(table, [
        { guild_id: '1' },
        { guild_id: '2' },
        { guild_id: '3' },
    ], 2);

    assert.equal(statements.length, 2);
    assert.deepEqual(statements[0].values, ['1', '2']);
    assert.deepEqual(statements[1].values, ['3']);
});

