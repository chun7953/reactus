// src/db/database.js (修正版)

import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;
let pool;

export async function initializeDatabase() {
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
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL Database connected successfully.');
        await createTables();
        return pool;
    } catch (err) {
        console.error('PostgreSQL Connection Error:', err);
        process.exit(1);
    }
}

async function createTables() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS reactions ( guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, emojis TEXT NOT NULL, trigger TEXT NOT NULL, PRIMARY KEY (guild_id, channel_id, trigger) );`);
        await pool.query(`CREATE TABLE IF NOT EXISTS announcements ( guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY (guild_id, channel_id) );`);
        await pool.query(`CREATE TABLE IF NOT EXISTS calendar_monitors ( id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, calendar_id TEXT NOT NULL, trigger_keyword TEXT NOT NULL, mention_role TEXT, UNIQUE (guild_id, channel_id, trigger_keyword) );`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_configs (
                guild_id TEXT PRIMARY KEY,
                main_calendar_id TEXT,
                giveaway_manager_roles TEXT[]
            );
        `);
        await pool.query(`CREATE TABLE IF NOT EXISTS notified_events ( event_id TEXT PRIMARY KEY, notified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL );`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS giveaways (
                message_id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                prize TEXT NOT NULL,
                winner_count INTEGER NOT NULL DEFAULT 1,
                end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                status TEXT NOT NULL DEFAULT 'RUNNING',
                winners TEXT[],
                participants TEXT[] DEFAULT '{}'::TEXT[],
                validation_fails INTEGER DEFAULT 0
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scheduled_giveaways (
                id SERIAL PRIMARY KEY,
                guild_id TEXT NOT NULL,
                prize TEXT NOT NULL,
                winner_count INTEGER NOT NULL DEFAULT 1,
                giveaway_channel_id TEXT NOT NULL,
                start_time TIMESTAMP WITH TIME ZONE,
                duration_hours NUMERIC,
                end_time TIMESTAMP WITH TIME ZONE,
                schedule_cron TEXT,
                confirmation_channel_id TEXT,
                confirmation_role_id TEXT
            );
        `);
        console.log('✅ Tables checked/created successfully.');
        
        // 既存のテーブルに validation_fails カラムを追加しようと試みる
        try {
            await pool.query(`ALTER TABLE giveaways ADD COLUMN validation_fails INTEGER DEFAULT 0;`);
            console.log('✅ "giveaways" table updated with "validation_fails" column.');
        } catch (err) {
            // "duplicate column" エラー (コード 42701) は、既にカラムが存在することを意味するので無視する
            if (err.code !== '42701') { 
                console.error('Error adding "validation_fails" column (this may be expected if it exists):', err.message);
            }
        }

    } catch (err) {
        console.error('Error creating tables:', err);
    }
}