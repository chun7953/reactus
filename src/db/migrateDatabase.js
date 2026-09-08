const TABLES = [
    { name: 'reactions', columns: ['guild_id', 'channel_id', 'emojis', 'trigger'] },
    { name: 'announcements', columns: ['guild_id', 'channel_id', 'message'] },
    { name: 'calendar_monitors', columns: ['id', 'guild_id', 'channel_id', 'calendar_id', 'trigger_keyword', 'mention_role'] },
    { name: 'guild_configs', columns: ['guild_id', 'main_calendar_id', 'giveaway_manager_roles'] },
    { name: 'notified_events', columns: ['event_id', 'notified_at'] },
    { name: 'giveaways', columns: ['message_id', 'guild_id', 'channel_id', 'prize', 'winner_count', 'end_time', 'status', 'winners', 'participants', 'validation_fails'] },
    { name: 'scheduled_giveaways', columns: ['id', 'guild_id', 'prize', 'winner_count', 'giveaway_channel_id', 'start_time', 'duration_hours', 'end_time', 'schedule_cron', 'confirmation_channel_id', 'confirmation_role_id'] },
];

const MIGRATION_NAME = 'fly_postgres_to_supabase_v1';

function quoteIdentifier(value) {
    return `"${value.replaceAll('"', '""')}"`;
}

export function buildInsertBatches(table, rows, batchSize = 100) {
    const statements = [];
    const tableName = `public.${quoteIdentifier(table.name)}`;
    const columnList = table.columns.map(quoteIdentifier).join(', ');

    for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values = [];
        const groups = batch.map((row) => {
            const placeholders = table.columns.map((column) => {
                values.push(row[column]);
                return `$${values.length}`;
            });
            return `(${placeholders.join(', ')})`;
        });

        statements.push({
            query: `INSERT INTO ${tableName} (${columnList}) VALUES ${groups.join(', ')}`,
            values,
        });
    }

    return statements;
}

async function ensureMigrationStateTable(target) {
    await target.query(`
        CREATE SCHEMA IF NOT EXISTS reactus_internal;
        CREATE TABLE IF NOT EXISTS reactus_internal.migration_state (
            migration_name TEXT PRIMARY KEY,
            completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            source_counts JSONB NOT NULL
        );
    `);
}

async function migrationAlreadyCompleted(target) {
    const result = await target.query(
        'SELECT 1 FROM reactus_internal.migration_state WHERE migration_name = $1',
        [MIGRATION_NAME],
    );
    return result.rowCount > 0;
}

async function resetSequence(target, tableName) {
    await target.query(`
        SELECT setval(
            pg_get_serial_sequence('public.${tableName}', 'id'),
            COALESCE((SELECT MAX(id) FROM public.${tableName}), 1),
            EXISTS (SELECT 1 FROM public.${tableName})
        )
    `);
}

export async function migrateDatabase(sourcePool, targetPool) {
    const target = await targetPool.connect();
    let source;
    let sourceTransaction = false;
    let targetTransaction = false;

    try {
        await ensureMigrationStateTable(target);
        if (await migrationAlreadyCompleted(target)) {
            return { migrated: false, counts: null };
        }

        source = await sourcePool.connect();
        await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        sourceTransaction = true;
        await target.query('BEGIN');
        targetTransaction = true;

        const truncateList = TABLES.map(({ name }) => `public.${quoteIdentifier(name)}`).join(', ');
        await target.query(`TRUNCATE ${truncateList} RESTART IDENTITY`);

        const counts = {};
        for (const table of TABLES) {
            const columnList = table.columns.map(quoteIdentifier).join(', ');
            const sourceResult = await source.query(
                `SELECT ${columnList} FROM public.${quoteIdentifier(table.name)}`,
            );

            for (const statement of buildInsertBatches(table, sourceResult.rows)) {
                await target.query(statement.query, statement.values);
            }

            const targetResult = await target.query(
                `SELECT COUNT(*)::INTEGER AS count FROM public.${quoteIdentifier(table.name)}`,
            );
            const targetCount = Number(targetResult.rows[0].count);
            if (targetCount !== sourceResult.rows.length) {
                throw new Error(`Row count mismatch for ${table.name}: source=${sourceResult.rows.length}, target=${targetCount}`);
            }
            counts[table.name] = targetCount;
        }

        await resetSequence(target, 'calendar_monitors');
        await resetSequence(target, 'scheduled_giveaways');
        await target.query(
            `INSERT INTO reactus_internal.migration_state (migration_name, source_counts)
             VALUES ($1, $2::jsonb)`,
            [MIGRATION_NAME, JSON.stringify(counts)],
        );

        await target.query('COMMIT');
        targetTransaction = false;
        await source.query('COMMIT');
        sourceTransaction = false;

        return { migrated: true, counts };
    } catch (error) {
        if (targetTransaction) await target.query('ROLLBACK').catch(() => {});
        if (sourceTransaction && source) await source.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        source?.release();
        target.release();
    }
}

