import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { createDatabaseManager } from '../src/db/database.js';

const connectionString = process.env.REACTUS_TEST_DATABASE_URL;
const isLocal = connectionString && ['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname);

test('internal calendar tables are RLS protected while the DB owner retains access', {
    skip: !connectionString,
}, async () => {
    // This test creates ordinary schema tables and temporary roles. It must
    // never be pointed at a live database.
    assert.ok(isLocal, 'RLS integration test must use local CI PostgreSQL only');

    const manager = createDatabaseManager({
        connectionString,
        createPoolFn: cs => new pg.Pool({ connectionString: cs, ssl: false }),
        logger: { log() {} },
    });
    let connection;
    try {
        const pool = await manager.initializeDatabase();
        const tables = [
            'web_calendar_snapshots',
            'calendar_claims',
            'schema_migrations',
        ];
        const check = await pool.query(`
            SELECT c.relname, c.relrowsecurity
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        `, [tables]);
        assert.equal(check.rows.length, tables.length);
        assert.ok(check.rows.every(row => row.relrowsecurity === true));

        const policies = await pool.query(`
            SELECT tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = ANY($1::text[])
        `, [tables]);
        assert.equal(policies.rows.length, 0, 'No public API role should have an allow policy');

        const ownerRead = await pool.query('SELECT COUNT(*)::int AS count FROM public.schema_migrations');
        assert.ok(ownerRead.rows[0].count >= 1, 'Bot can still read migration state');

        connection = await pool.connect();
        const role = 'reactus_rls_test_' + randomUUID().replaceAll('-', '');
        await connection.query('BEGIN');
        await connection.query(`CREATE ROLE "${role}" NOLOGIN`);
        await connection.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
        for (const table of tables) {
            await connection.query(`GRANT SELECT ON TABLE public."${table}" TO "${role}"`);
        }
        await connection.query(`SET LOCAL ROLE "${role}"`);
        const publicRead = await connection.query('SELECT COUNT(*)::int AS count FROM public.schema_migrations');
        assert.equal(publicRead.rows[0].count, 0, 'Unprivileged API role cannot see internal rows');
    } finally {
        if (connection) {
            await connection.query('ROLLBACK').catch(() => {});
            connection.release();
        }
        await manager.closeDatabase();
    }
});
