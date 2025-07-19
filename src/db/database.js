// /src/db/database.js

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
        
        // ★★★ここからが追記部分です★★★
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
        // ★★★ここまでが追記部分です★★★
await pool.query(`
    CREATE TABLE IF NOT EXISTS notified_events (
        event_id TEXT PRIMARY KEY,
        notified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
`);
        console.log('✅ Tables checked/created successfully.');
    } catch (err) {
        console.error('Error creating tables:', err);
    }
}