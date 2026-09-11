import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRestoreData, restoreGuildSettings } from '../src/lib/restoreSettings.js';

function createPool({ failWhen, verifiedCalendarIds = ['calendar-1', 'main-calendar'] } = {}) {
    const queries = [];
    const claimQueries = [];
    const releases = [];
    const client = {
        async query(sql, values) {
            queries.push({ sql, values });
            if (failWhen?.(sql, values)) throw new Error('simulated database failure');
            return { rows: [] };
        },
        release(error) {
            releases.push(error);
        },
    };

    return {
        queries,
        claimQueries,
        releases,
        connectCalls: 0,
        async query(sql, values) {
            claimQueries.push({ sql, values });
            if (!String(sql).includes('FROM calendar_claims')) throw new Error(`Unexpected pool query: ${sql}`);
            return {
                rows: verifiedCalendarIds.map(calendarId => ({ calendar_id: calendarId })),
                rowCount: verifiedCalendarIds.length,
            };
        },
        async connect() {
            this.connectCalls += 1;
            return client;
        },
    };
}

const rawData = {
    reactions: [['sheet-guild', 'channel-1', '👍', 'keyword']],
    announcements: [['sheet-guild', 'channel-2', 'message']],
    calendarMonitors: [['sheet-guild', 'channel-3', 'calendar-1', 'event']],
    guildConfigs: [['sheet-guild', 'main-calendar', 'role-1, role-2']],
};

test('normalizeRestoreData scopes every row to the current guild', () => {
    const normalized = normalizeRestoreData('current-guild', rawData);

    assert.deepEqual(normalized.reactions[0], ['current-guild', 'channel-1', '👍', 'keyword']);
    assert.deepEqual(normalized.announcements[0], ['current-guild', 'channel-2', 'message']);
    assert.deepEqual(normalized.calendarMonitors[0], [
        'current-guild',
        'channel-3',
        'calendar-1',
        'event',
        null,
    ]);
    assert.deepEqual(normalized.guildConfigs[0], [
        'current-guild',
        'main-calendar',
        ['role-1', 'role-2'],
    ]);
    assert.equal(rawData.calendarMonitors[0].length, 4, 'input rows must not be mutated');
});

test('restoreGuildSettings commits all replacements on one client after claim validation', async () => {
    const pool = createPool();

    const counts = await restoreGuildSettings(pool, 'current-guild', rawData);

    assert.equal(pool.claimQueries.length, 1);
    assert.deepEqual(pool.claimQueries[0].values, ['current-guild', ['calendar-1', 'main-calendar']]);
    assert.equal(pool.connectCalls, 1);
    assert.equal(pool.queries[0].sql, 'BEGIN');
    assert.equal(pool.queries.at(-1).sql, 'COMMIT');
    assert.equal(pool.queries.some(({ sql }) => sql === 'ROLLBACK'), false);
    assert.deepEqual(pool.releases, [undefined]);
    assert.deepEqual(counts, { reactions: 1, announces: 1, monitors: 1, configs: 1 });
});

test('restoreGuildSettings rejects unverified calendars before opening a transaction', async () => {
    const pool = createPool({ verifiedCalendarIds: ['calendar-1'] });

    await assert.rejects(
        restoreGuildSettings(pool, 'current-guild', rawData),
        error => (
            error.code === 'UNVERIFIED_CALENDAR_RESTORE'
            && error.message.includes('main-calendar')
            && error.message.includes('/verify-calendar')
        ),
    );

    assert.equal(pool.connectCalls, 0);
    assert.deepEqual(pool.queries, []);
});

test('restoreGuildSettings rolls back every change when an insert fails', async () => {
    const pool = createPool({
        failWhen: sql => sql.startsWith('INSERT INTO calendar_monitors'),
    });

    await assert.rejects(
        restoreGuildSettings(pool, 'current-guild', rawData),
        /simulated database failure/,
    );

    assert.equal(pool.queries[0].sql, 'BEGIN');
    assert.equal(pool.queries.at(-1).sql, 'ROLLBACK');
    assert.equal(pool.queries.some(({ sql }) => sql === 'COMMIT'), false);
    assert.deepEqual(pool.releases, [undefined]);
});

test('restoreGuildSettings validates sheet rows before checking claims or acquiring a connection', async () => {
    const pool = createPool();
    const invalidData = {
        ...rawData,
        reactions: [['sheet-guild', 'channel-1', '', 'keyword']],
    };

    await assert.rejects(
        restoreGuildSettings(pool, 'current-guild', invalidData),
        /missing required data/,
    );

    assert.equal(pool.connectCalls, 0);
    assert.deepEqual(pool.claimQueries, []);
    assert.deepEqual(pool.queries, []);
});