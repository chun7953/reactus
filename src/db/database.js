import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;
let pool;

export function initializeDatabase() {
    if (pool) return pool;

    if (!config.database.connectionString) {
        console.error("DATABASE_URL environment variable not found. Bot cannot start.");
        process.exit(1);
    }

    pool = new Pool({
        connectionString: config.database.connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    return new Promise((resolve, reject) => {
        pool.connect((err, client, release) => {
            if (err) {
                console.error('PostgreSQL Connection Error:', err);
                return reject(err);
            }
            console.log('✅ PostgreSQL Database connected successfully.');
            client.release();
            createTables();
            resolve(pool);
        });
    });
}

async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reactions (
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                emojis TEXT NOT NULL,
                trigger TEXT NOT NULL,
                PRIMARY KEY (guild_id, channel_id, trigger)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS announcements (
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                message TEXT NOT NULL,
                PRIMARY KEY (guild_id, channel_id)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS calendar_monitors (
                id SERIAL PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                calendar_id TEXT NOT NULL,
                trigger_keyword TEXT NOT NULL,
                mention_role TEXT,
                UNIQUE (guild_id, channel_id, trigger_keyword)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_configs (
                guild_id TEXT PRIMARY KEY,
                main_calendar_id TEXT
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notified_events (
                event_id TEXT PRIMARY KEY,
                notified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
            );
        `);

        // ★★★ ここからがGiveaway用の新しいテーブルです ★★★
        await pool.query(`
            CREATE TABLE IF NOT EXISTS giveaways (
                message_id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                prize TEXT NOT NULL,
                winner_count INTEGER NOT NULL DEFAULT 1,
                end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                status TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING, ENDED, CANCELLED
                winners TEXT[] -- 当選者のIDを配列で保存
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scheduled_giveaways (
                id SERIAL PRIMARY KEY,
                guild_id TEXT NOT NULL,
                prize TEXT NOT NULL,
                schedule_cron TEXT, -- '毎週月曜21時'のような繰り返しルール
                start_time TIMESTAMP WITH TIME ZONE, -- 1回限りの予約の場合の開始時刻
                duration_hours INTEGER NOT NULL,
                winner_count INTEGER NOT NULL DEFAULT 1,
                confirmation_channel_id TEXT,
                confirmation_role_id TEXT
            );
        `);
        // ★★★ ここまでが追記部分です ★★★

        console.log('✅ Tables checked/created successfully.');
    } catch (err) {
        console.error('Error creating tables:', err);
    }
}