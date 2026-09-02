// src/db/database.js

import pg from 'pg';
import config from '../config.js';
import { migrateDatabase } from './migrateDatabase.js';

const { Pool } = pg;

const DB_CONNECTION_TIMEOUT_MS = 15000;
const DB_CONNECT_ATTEMPTS = 3;
const DB_RETRY_BASE_DELAY_MS = 1000;

function createPool(connectionString, max = 5) {
    const result = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
        max,
        application_name: 'reactus',
    });

    result.on('error', (err) => {
        console.error('Unexpected error on idle database client', err);
    });
    return result;
}

export async function queryWithRetry(db, sql, {
    attempts = DB_CONNECT_ATTEMPTS,
    baseDelayMs = DB_RETRY_BASE_DELAY_MS,
    onRetry = ({ attempt, delayMs, error }) => {
        console.warn(
            `Database connection attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms: ${error.message}`,
        );
    },
} = {}) {
    if (!Number.isInteger(attempts) || attempts < 1) {
        throw new RangeError('attempts must be a positive integer');
    }

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await db.query(sql);
        } catch (error) {
            if (attempt === attempts) throw error;

            const delayMs = baseDelayMs * attempt;
            onRetry({ attempt, delayMs, error });
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

async function createTables(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS reactions ( guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, emojis TEXT NOT NULL, trigger TEXT NOT NULL, PRIMARY KEY (guild_id, channel_id, trigger) );`);
    await db.query(`CREATE TABLE IF NOT EXISTS announcements ( guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY (guild_id, channel_id) );`);
    await db.query(`CREATE TABLE IF NOT EXISTS calendar_monitors ( id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, calendar_id TEXT NOT NULL, trigger_keyword TEXT NOT NULL, mention_role TEXT, UNIQUE (guild_id, channel_id, trigger_keyword) );`);
    await db.query(`CREATE TABLE IF NOT EXISTS guild_configs ( guild_id TEXT PRIMARY KEY, main_calendar_id TEXT, giveaway_manager_roles TEXT[] );`);
    await db.query(`CREATE TABLE IF NOT EXISTS notified_events ( event_id TEXT PRIMARY KEY, notified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL );`);
    await db.query(`CREATE TABLE IF NOT EXISTS giveaways ( message_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, prize TEXT NOT NULL, winner_count INTEGER NOT NULL DEFAULT 1, end_time TIMESTAMP WITH TIME ZONE NOT NULL, status TEXT NOT NULL DEFAULT 'RUNNING', winners TEXT[], participants TEXT[] DEFAULT '{}'::TEXT[], validation_fails INTEGER DEFAULT 0 );`);
    await db.query(`CREATE TABLE IF NOT EXISTS scheduled_giveaways ( id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, prize TEXT NOT NULL, winner_count INTEGER NOT NULL DEFAULT 1, giveaway_channel_id TEXT NOT NULL, start_time TIMESTAMP WITH TIME ZONE, duration_hours NUMERIC, end_time TIMESTAMP WITH TIME ZONE, schedule_cron TEXT, confirmation_channel_id TEXT, confirmation_role_id TEXT );`);
    await db.query(`ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS validation_fails INTEGER DEFAULT 0;`);
    console.log('✅ Tables checked/created successfully.');
}

export function createDatabaseManager({
    connectionString,
    migrationTargetConnectionString,
    createPoolFn = createPool,
    createTablesFn = createTables,
    migrateDatabaseFn = migrateDatabase,
    logger = console,
} = {}) {
    let pool;
    let initializationPromise;
    let closePromise;
    let closed = false;

    async function initializeOnce() {
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable not found. Bot cannot start.');
        }

        const sourcePool = createPoolFn(connectionString, 2);
        let targetPool;

        try {
            if (migrationTargetConnectionString && migrationTargetConnectionString !== connectionString) {
                targetPool = createPoolFn(migrationTargetConnectionString, 5);
                await queryWithRetry(targetPool, 'SELECT NOW()');
                await createTablesFn(targetPool);

                const result = await migrateDatabaseFn(sourcePool, targetPool);
                if (result.migrated) {
                    logger.log('✅ Database migration completed:', result.counts);
                } else {
                    logger.log('✅ Database migration was already completed.');
                }

                await sourcePool.end();
                pool = targetPool;
            } else {
                await queryWithRetry(sourcePool, 'SELECT NOW()');
                await createTablesFn(sourcePool);
                pool = sourcePool;
            }

            logger.log('✅ PostgreSQL Database connected successfully.');
            return pool;
        } catch (error) {
            const pools = new Set([sourcePool, targetPool].filter(Boolean));
            await Promise.allSettled([...pools].map(candidate => candidate.end()));
            throw new Error('PostgreSQL initialization or migration failed.', { cause: error });
        }
    }

    function initializeDatabase() {
        if (pool) return Promise.resolve(pool);
        if (closed) return Promise.reject(new Error('Database manager is closed.'));
        if (initializationPromise) return initializationPromise;
        if (closePromise) return Promise.reject(new Error('Database manager is closing.'));

        const pending = initializeOnce();
        initializationPromise = pending;
        pending.then(
            () => {
                if (initializationPromise === pending) initializationPromise = undefined;
            },
            () => {
                if (initializationPromise === pending) initializationPromise = undefined;
            },
        );
        return pending;
    }

    function closeDatabase() {
        if (closePromise) return closePromise;

        const pending = (async () => {
            closed = true;
            if (initializationPromise) {
                await initializationPromise.catch(() => {});
            }

            const activePool = pool;
            pool = undefined;
            if (!activePool) return false;

            await activePool.end();
            return true;
        })();

        closePromise = pending;
        pending.then(
            () => {
                if (closePromise === pending) closePromise = undefined;
            },
            () => {
                if (closePromise === pending) closePromise = undefined;
            },
        );
        return pending;
    }

    return { initializeDatabase, closeDatabase };
}

const databaseManager = createDatabaseManager({
    connectionString: config.database.connectionString,
    migrationTargetConnectionString: config.database.migrationTargetConnectionString,
});

export const initializeDatabase = databaseManager.initializeDatabase;
export const closeDatabase = databaseManager.closeDatabase;
