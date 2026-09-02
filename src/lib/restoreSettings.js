const REQUIRED_COLUMNS = {
    reactions: [1, 2, 3],
    announcements: [1, 2],
    calendarMonitors: [1, 2, 3],
};

function validateRequiredColumns(rows, datasetName) {
    const requiredColumns = REQUIRED_COLUMNS[datasetName] || [];

    rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) {
            throw new TypeError(`${datasetName} row ${rowIndex + 2} is invalid`);
        }

        for (const columnIndex of requiredColumns) {
            if (row[columnIndex] === undefined || row[columnIndex] === null || row[columnIndex] === '') {
                throw new Error(`${datasetName} row ${rowIndex + 2} is missing required data`);
            }
        }
    });
}

function parseManagerRoles(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map(role => role.trim())
        .filter(Boolean);
}

export function normalizeRestoreData(guildId, data) {
    if (!guildId) throw new Error('guildId is required');

    const reactions = data.reactions || [];
    const announcements = data.announcements || [];
    const calendarMonitors = data.calendarMonitors || [];
    const guildConfigs = data.guildConfigs || [];

    validateRequiredColumns(reactions, 'reactions');
    validateRequiredColumns(announcements, 'announcements');
    validateRequiredColumns(calendarMonitors, 'calendarMonitors');

    for (const [rowIndex, row] of guildConfigs.entries()) {
        if (!Array.isArray(row)) {
            throw new TypeError(`guildConfigs row ${rowIndex + 2} is invalid`);
        }
    }

    return {
        reactions: reactions.map(row => [guildId, row[1], row[2], row[3]]),
        announcements: announcements.map(row => [guildId, row[1], row[2]]),
        calendarMonitors: calendarMonitors.map(row => [
            guildId,
            row[1],
            row[2],
            row[3],
            row[4] || null,
        ]),
        guildConfigs: guildConfigs.map(row => [
            guildId,
            row[1] || null,
            parseManagerRoles(row[2]),
        ]),
    };
}

async function replaceGuildSettings(client, guildId, data) {
    await client.query('DELETE FROM reactions WHERE guild_id = $1', [guildId]);
    for (const row of data.reactions) {
        await client.query(
            'INSERT INTO reactions (guild_id, channel_id, emojis, trigger) VALUES ($1, $2, $3, $4)',
            row,
        );
    }

    await client.query('DELETE FROM announcements WHERE guild_id = $1', [guildId]);
    for (const row of data.announcements) {
        await client.query(
            `INSERT INTO announcements (guild_id, channel_id, message)
             VALUES ($1, $2, $3)
             ON CONFLICT (guild_id, channel_id)
             DO UPDATE SET message = EXCLUDED.message`,
            row,
        );
    }

    await client.query('DELETE FROM calendar_monitors WHERE guild_id = $1', [guildId]);
    for (const row of data.calendarMonitors) {
        await client.query(
            `INSERT INTO calendar_monitors
                (guild_id, channel_id, calendar_id, trigger_keyword, mention_role)
             VALUES ($1, $2, $3, $4, $5)`,
            row,
        );
    }

    await client.query('DELETE FROM guild_configs WHERE guild_id = $1', [guildId]);
    for (const row of data.guildConfigs) {
        await client.query(
            `INSERT INTO guild_configs (guild_id, main_calendar_id, giveaway_manager_roles)
             VALUES ($1, $2, $3)
             ON CONFLICT (guild_id)
             DO UPDATE SET
                main_calendar_id = EXCLUDED.main_calendar_id,
                giveaway_manager_roles = EXCLUDED.giveaway_manager_roles`,
            row,
        );
    }
}

export async function restoreGuildSettings(pool, guildId, rawData) {
    // Validate and normalize untrusted spreadsheet data before opening a transaction.
    const data = normalizeRestoreData(guildId, rawData);
    const client = await pool.connect();
    let transactionOpen = false;
    let releaseError;

    try {
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL statement_timeout = '30s'");
        await replaceGuildSettings(client, guildId, data);
        await client.query('COMMIT');
        transactionOpen = false;

        return {
            reactions: data.reactions.length,
            announces: data.announcements.length,
            monitors: data.calendarMonitors.length,
            configs: data.guildConfigs.length,
        };
    } catch (error) {
        if (transactionOpen) {
            try {
                await client.query('ROLLBACK');
                transactionOpen = false;
            } catch (rollbackError) {
                releaseError = rollbackError;
                console.error('Restore rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        client.release(releaseError);
    }
}
