import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildBackupSheets,
    createAtomicSheetUpdateRequests,
    loadBackupSnapshot,
    writeBackupAtomically,
} from '../src/lib/backupWriter.js';

const guildId = '123456789';

function createPool({ failAt } = {}) {
    const calls = [];
    const rowsByTable = {
        reactions: [{ guild_id: guildId, channel_id: 'channel-1', emojis: '👍', trigger: 'hello' }],
        announcements: [{ guild_id: guildId, channel_id: 'channel-2', message: 'notice' }],
        calendar_monitors: [{
            guild_id: guildId,
            channel_id: 'channel-3',
            calendar_id: 'calendar-1',
            trigger_keyword: 'event',
            mention_role: 'role-1',
        }],
        guild_configs: [{
            guild_id: guildId,
            main_calendar_id: 'main-calendar',
            giveaway_manager_roles: ['role-1', 'role-2'],
        }],
    };
    const client = {
        releasedWith: undefined,
        async query(sql, params) {
            calls.push({ sql, params });
            const table = Object.keys(rowsByTable).find(name => sql.includes(`FROM ${name}`));
            if (failAt && table === failAt) throw new Error(`failed at ${table}`);
            return { rows: table ? rowsByTable[table] : [] };
        },
        release(error) {
            this.releasedWith = error;
        },
    };
    return {
        calls,
        client,
        pool: { async connect() { return client; } },
    };
}

test('loadBackupSnapshot reads every table in one short consistent transaction', async () => {
    const { pool, calls, client } = createPool();
    const snapshot = await loadBackupSnapshot(pool, guildId);

    assert.deepEqual(Object.keys(snapshot), [
        'reactions',
        'announcements',
        'calendarMonitors',
        'guildConfigs',
    ]);
    assert.equal(calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(calls[1].sql, "SET LOCAL statement_timeout = '30s'");
    assert.equal(calls.at(-1).sql, 'COMMIT');
    assert.equal(calls.some(call => call.sql === 'ROLLBACK'), false);
    assert.equal(client.releasedWith, undefined);
});

test('loadBackupSnapshot rolls back when a query fails', async () => {
    const { pool, calls } = createPool({ failAt: 'calendar_monitors' });

    await assert.rejects(() => loadBackupSnapshot(pool, guildId), /calendar_monitors/);
    assert.equal(calls.some(call => call.sql === 'ROLLBACK'), true);
    assert.equal(calls.some(call => call.sql === 'COMMIT'), false);
});

test('buildBackupSheets includes all data and generation metadata', () => {
    const snapshot = {
        reactions: [{ guild_id: guildId, channel_id: 'c1', emojis: '👍', trigger: 'hello' }],
        announcements: [],
        calendarMonitors: [],
        guildConfigs: [{
            guild_id: guildId,
            main_calendar_id: 'cal',
            giveaway_manager_roles: ['r1', 'r2'],
        }],
    };
    const backupSheets = buildBackupSheets(guildId, snapshot, {
        backupId: 'backup-123',
        completedAt: '2026-09-02T12:34:56.000Z',
    });

    assert.equal(backupSheets.length, 5);
    assert.deepEqual(backupSheets[0].values[1], [guildId, 'c1', '👍', 'hello']);
    assert.deepEqual(backupSheets[3].values[1], [guildId, 'cal', 'r1,r2']);
    assert.deepEqual(backupSheets[4].values[1], [
        '1', guildId, 'backup-123', '2026-09-02T12:34:56.000Z',
    ]);
});

test('createAtomicSheetUpdateRequests replaces every sheet in one request list', () => {
    const backupSheets = [
        { sheetName: 'A', values: [['header'], ['value']] },
        { sheetName: 'B', values: [['header']] },
    ];
    const requests = createAtomicSheetUpdateRequests(backupSheets, new Map([['A', 10], ['B', 20]]));

    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(request => request.updateCells.range.sheetId), [10, 20]);
    assert.equal(
        requests[0].updateCells.rows[1].values[0].userEnteredValue.stringValue,
        'value',
    );
});

test('writeBackupAtomically creates missing sheets before one atomic content update', async () => {
    const getResponses = [
        { data: { sheets: [{ properties: { title: 'A', sheetId: 10 } }] } },
        { data: { sheets: [
            { properties: { title: 'A', sheetId: 10 } },
            { properties: { title: 'B', sheetId: 20 } },
        ] } },
    ];
    const batchUpdates = [];
    const sheets = {
        spreadsheets: {
            async get() { return getResponses.shift(); },
            async batchUpdate(request) { batchUpdates.push(request); },
        },
    };
    const backupSheets = [
        { sheetName: 'A', values: [['header']] },
        { sheetName: 'B', values: [['header']] },
    ];

    await writeBackupAtomically(sheets, 'auth', 'spreadsheet', backupSheets);

    assert.equal(batchUpdates.length, 2);
    assert.deepEqual(batchUpdates[0].requestBody.requests, [
        { addSheet: { properties: { title: 'B' } } },
    ]);
    assert.deepEqual(
        batchUpdates[1].requestBody.requests.map(request => request.updateCells.range.sheetId),
        [10, 20],
    );
});
