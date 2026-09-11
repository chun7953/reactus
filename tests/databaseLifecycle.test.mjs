import assert from 'node:assert/strict';
import test from 'node:test';

import { createDatabaseManager } from '../src/db/database.js';

const silentLogger = { log() {} };

test('database initialization is single-flight and closes one shared pool', async () => {
    let poolsCreated = 0;
    let checks = 0;
    let tableChecks = 0;
    let claimMigrations = 0;
    let closes = 0;
    const pool = {
        async query() {
            checks += 1;
            return { rows: [] };
        },
        async end() { closes += 1; },
    };
    const manager = createDatabaseManager({
        connectionString: 'postgres://database',
        createPoolFn() {
            poolsCreated += 1;
            return pool;
        },
        createTablesFn: async (candidate) => {
            assert.equal(candidate, pool);
            tableChecks += 1;
        },
        migrateLegacyCalendarClaimsFn: async (candidate) => {
            assert.equal(candidate, pool);
            claimMigrations += 1;
        },
        logger: silentLogger,
    });

    const [first, second, third] = await Promise.all([
        manager.initializeDatabase(),
        manager.initializeDatabase(),
        manager.initializeDatabase(),
    ]);

    assert.equal(first, pool);
    assert.equal(second, pool);
    assert.equal(third, pool);
    assert.equal(poolsCreated, 1);
    assert.equal(checks, 1);
    assert.equal(tableChecks, 1);
    assert.equal(claimMigrations, 1);

    assert.deepEqual(await Promise.all([
        manager.closeDatabase(),
        manager.closeDatabase(),
    ]), [true, true]);
    assert.equal(closes, 1);
    assert.equal(await manager.closeDatabase(), false);
});

test('database initialization rejects missing configuration instead of exiting the process', async () => {
    const manager = createDatabaseManager({ logger: silentLogger });
    await assert.rejects(manager.initializeDatabase(), /DATABASE_URL/);
    assert.equal(await manager.closeDatabase(), false);
});

test('database shutdown waits for an in-flight initialization and closes its pool', async () => {
    let releaseCheck;
    let closes = 0;
    const pool = {
        query: () => new Promise(resolve => { releaseCheck = resolve; }),
        async end() { closes += 1; },
    };
    const manager = createDatabaseManager({
        connectionString: 'postgres://database',
        createPoolFn: () => pool,
        createTablesFn: async () => {},
        migrateLegacyCalendarClaimsFn: async () => {},
        logger: silentLogger,
    });

    const initialization = manager.initializeDatabase();
    const closing = manager.closeDatabase();
    releaseCheck({ rows: [] });

    assert.equal(await initialization, pool);
    assert.equal(await closing, true);
    assert.equal(closes, 1);
});

test('legacy calendar claims are migrated only after database copy reaches the target', async () => {
    const order = [];
    const sourcePool = {
        async end() { order.push('source-close'); },
    };
    const targetPool = {
        async query() {
            order.push('target-check');
            return { rows: [] };
        },
        async end() { order.push('target-close'); },
    };
    const manager = createDatabaseManager({
        connectionString: 'postgres://source',
        migrationTargetConnectionString: 'postgres://target',
        createPoolFn(connectionString) {
            return connectionString === 'postgres://source' ? sourcePool : targetPool;
        },
        createTablesFn: async (candidate) => {
            assert.equal(candidate, targetPool);
            order.push('tables');
        },
        migrateDatabaseFn: async (source, target) => {
            assert.equal(source, sourcePool);
            assert.equal(target, targetPool);
            order.push('copy');
            return { migrated: true, counts: {}, copiedCalendarClaims: false };
        },
        migrateLegacyCalendarClaimsFn: async (candidate, options) => {
            assert.equal(candidate, targetPool);
            assert.equal(options.allowBootstrap, true);
            order.push('claims');
        },
        logger: silentLogger,
    });

    assert.equal(await manager.initializeDatabase(), targetPool);
    assert.deepEqual(order.slice(0, 5), ['target-check', 'tables', 'copy', 'claims', 'source-close']);
    await manager.closeDatabase();
});

test('database move never recreates trust when the source already has calendar claims authority', async () => {
    const sourcePool = { async end() {} };
    const targetPool = {
        async query() { return { rows: [] }; },
        async end() {},
    };
    let bootstrapOption;
    const manager = createDatabaseManager({
        connectionString: 'postgres://source',
        migrationTargetConnectionString: 'postgres://target',
        createPoolFn(connectionString) {
            return connectionString === 'postgres://source' ? sourcePool : targetPool;
        },
        createTablesFn: async () => {},
        migrateDatabaseFn: async () => ({
            migrated: true,
            counts: { calendar_claims: 0 },
            copiedCalendarClaims: true,
        }),
        migrateLegacyCalendarClaimsFn: async (_candidate, options) => {
            bootstrapOption = options.allowBootstrap;
        },
        logger: silentLogger,
    });

    assert.equal(await manager.initializeDatabase(), targetPool);
    assert.equal(bootstrapOption, false);
    await manager.closeDatabase();
});
