import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInsertBatches, migrateDatabase } from '../src/db/migrateDatabase.js';

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

function migrationHarness({ sourceHasAssets }) {
    const imageData = Buffer.from([0, 1, 2, 250, 255]);
    const sourceRows = {
        reactions: [],
        announcements: [],
        calendar_monitors: [],
        guild_configs: [],
        notified_events: [],
        giveaways: [],
        scheduled_giveaways: [],
        calendar_post_assets: sourceHasAssets ? [{
            id: '11111111-1111-4111-8111-111111111111',
            guild_id: 'guild-1',
            filename: 'schedule.png',
            content_type: 'image/png',
            size_bytes: imageData.length,
            data: imageData,
            created_at: new Date('2026-09-01T00:00:00.000Z'),
        }] : [],
    };
    const sourceSelects = [];
    const targetQueries = [];
    const insertedCounts = new Map();
    let assetInsertValues = null;

    const source = {
        async query(sql, values = []) {
            const normalized = String(sql).trim();
            if (normalized.startsWith('BEGIN') || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
                return { rows: [], rowCount: 0 };
            }
            if (normalized.startsWith('SELECT to_regclass')) {
                const tableName = String(values[0]).replace('public.', '');
                const exists = tableName === 'calendar_post_assets'
                    ? sourceHasAssets
                    : tableName === 'calendar_claims' ? false : true;
                return { rows: [{ table_name: exists ? `public.${tableName}` : null }], rowCount: 1 };
            }
            const match = normalized.match(/FROM public\."([^"]+)"/);
            if (match) {
                const tableName = match[1];
                sourceSelects.push(tableName);
                return { rows: sourceRows[tableName] || [], rowCount: (sourceRows[tableName] || []).length };
            }
            throw new Error(`Unexpected source query: ${normalized}`);
        },
        release() {},
    };

    const target = {
        async query(sql, values = []) {
            const normalized = String(sql).trim();
            targetQueries.push(normalized);
            if (normalized.startsWith('CREATE SCHEMA')) return { rows: [], rowCount: 0 };
            if (normalized.startsWith('SELECT 1 FROM reactus_internal.migration_state')) {
                return { rows: [], rowCount: 0 };
            }
            if (normalized.startsWith('BEGIN') || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
                return { rows: [], rowCount: 0 };
            }
            if (normalized.startsWith('TRUNCATE ')) return { rows: [], rowCount: 0 };
            if (normalized.startsWith('INSERT INTO public.')) {
                const tableName = normalized.match(/INSERT INTO public\."([^"]+)"/)?.[1];
                if (!tableName) throw new Error(`Could not parse target insert: ${normalized}`);
                insertedCounts.set(tableName, (insertedCounts.get(tableName) || 0) + 1);
                if (tableName === 'calendar_post_assets') assetInsertValues = values;
                return { rows: [], rowCount: 1 };
            }
            if (normalized.startsWith('SELECT COUNT(*)::INTEGER AS count FROM public.')) {
                const tableName = normalized.match(/FROM public\."([^"]+)"/)?.[1];
                return { rows: [{ count: insertedCounts.get(tableName) || 0 }], rowCount: 1 };
            }
            if (normalized.startsWith('SELECT setval(')) return { rows: [], rowCount: 1 };
            if (normalized.startsWith('INSERT INTO reactus_internal.migration_state')) {
                return { rows: [], rowCount: 1 };
            }
            throw new Error(`Unexpected target query: ${normalized}`);
        },
        release() {},
    };

    return {
        sourcePool: { async connect() { return source; } },
        targetPool: { async connect() { return target; } },
        sourceSelects,
        targetQueries,
        getAssetInsertValues: () => assetInsertValues,
        imageData,
    };
}

test('database migration copies durable calendar post assets including binary data', async () => {
    const harness = migrationHarness({ sourceHasAssets: true });
    const result = await migrateDatabase(harness.sourcePool, harness.targetPool);

    assert.equal(result.migrated, true);
    assert.equal(result.copiedCalendarPostAssets, true);
    assert.equal(result.counts.calendar_post_assets, 1);
    assert.equal(harness.sourceSelects.includes('calendar_post_assets'), true);

    const values = harness.getAssetInsertValues();
    assert.ok(values);
    assert.equal(values[0], '11111111-1111-4111-8111-111111111111');
    assert.equal(values[1], 'guild-1');
    assert.equal(values[2], 'schedule.png');
    assert.equal(values[3], 'image/png');
    assert.equal(values[4], harness.imageData.length);
    assert.ok(Buffer.isBuffer(values[5]));
    assert.deepEqual(values[5], harness.imageData);
    assert.deepEqual(values[6], new Date('2026-09-01T00:00:00.000Z'));
});

test('old source databases without calendar assets skip asset reads but clear stale target assets', async () => {
    const harness = migrationHarness({ sourceHasAssets: false });
    const result = await migrateDatabase(harness.sourcePool, harness.targetPool);

    assert.equal(result.migrated, true);
    assert.equal(result.copiedCalendarPostAssets, false);
    assert.equal('calendar_post_assets' in result.counts, false);
    assert.equal(harness.sourceSelects.includes('calendar_post_assets'), false);

    const truncate = harness.targetQueries.find(query => query.startsWith('TRUNCATE '));
    assert.ok(truncate);
    assert.match(truncate, /public\."calendar_post_assets"/);
});
