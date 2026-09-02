import { randomUUID } from 'node:crypto';
import {
    BACKUP_SCHEMA_VERSION,
    getBackupMetadataSpec,
    getBackupSheetSpecs,
} from './backupValidation.js';

const BACKUP_QUERIES = [
    ['reactions', 'SELECT * FROM reactions WHERE guild_id = $1 ORDER BY channel_id, trigger'],
    ['announcements', 'SELECT * FROM announcements WHERE guild_id = $1 ORDER BY channel_id'],
    ['calendarMonitors', 'SELECT * FROM calendar_monitors WHERE guild_id = $1 ORDER BY channel_id, trigger_keyword'],
    ['guildConfigs', 'SELECT * FROM guild_configs WHERE guild_id = $1'],
];

export async function loadBackupSnapshot(pool, guildId) {
    const client = await pool.connect();
    let transactionOpen = false;
    let releaseError;

    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        transactionOpen = true;
        await client.query("SET LOCAL statement_timeout = '30s'");

        const snapshot = {};
        for (const [key, query] of BACKUP_QUERIES) {
            snapshot[key] = (await client.query(query, [guildId])).rows;
        }

        await client.query('COMMIT');
        transactionOpen = false;
        return snapshot;
    } catch (error) {
        if (transactionOpen) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                releaseError = rollbackError;
                console.error('Backup snapshot rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        client.release(releaseError);
    }
}

export function buildBackupSheets(
    guildId,
    snapshot,
    { backupId = randomUUID(), completedAt = new Date().toISOString() } = {},
) {
    const specs = Object.fromEntries(getBackupSheetSpecs(guildId).map(spec => [spec.key, spec]));
    const metadataSpec = getBackupMetadataSpec(guildId);

    return [
        {
            sheetName: specs.reactions.sheetName,
            values: [
                specs.reactions.headers,
                ...snapshot.reactions.map(row => [row.guild_id, row.channel_id, row.emojis, row.trigger]),
            ],
        },
        {
            sheetName: specs.announcements.sheetName,
            values: [
                specs.announcements.headers,
                ...snapshot.announcements.map(row => [row.guild_id, row.channel_id, row.message]),
            ],
        },
        {
            sheetName: specs.calendarMonitors.sheetName,
            values: [
                specs.calendarMonitors.headers,
                ...snapshot.calendarMonitors.map(row => [
                    row.guild_id,
                    row.channel_id,
                    row.calendar_id,
                    row.trigger_keyword,
                    row.mention_role,
                ]),
            ],
        },
        {
            sheetName: specs.guildConfigs.sheetName,
            values: [
                specs.guildConfigs.headers,
                ...snapshot.guildConfigs.map(row => [
                    row.guild_id,
                    row.main_calendar_id,
                    (row.giveaway_manager_roles || []).join(','),
                ]),
            ],
        },
        {
            sheetName: metadataSpec.sheetName,
            values: [
                metadataSpec.headers,
                [BACKUP_SCHEMA_VERSION, guildId, backupId, completedAt],
            ],
        },
    ];
}

export function createAtomicSheetUpdateRequests(backupSheets, sheetIds) {
    return backupSheets.map(({ sheetName, values }) => {
        const sheetId = sheetIds.get(sheetName);
        if (sheetId === undefined) throw new Error(`Missing sheet ID for ${sheetName}`);

        return {
            updateCells: {
                range: {
                    sheetId,
                    startRowIndex: 0,
                    startColumnIndex: 0,
                    endColumnIndex: values[0].length,
                },
                rows: values.map(row => ({
                    values: row.map(value => ({
                        userEnteredValue: { stringValue: String(value ?? '') },
                    })),
                })),
                fields: 'userEnteredValue',
            },
        };
    });
}

async function fetchSheetIds(sheets, auth, spreadsheetId) {
    const spreadsheet = await sheets.spreadsheets.get({
        auth,
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title)',
    });
    return new Map((spreadsheet.data.sheets || []).map(sheet => [
        sheet.properties.title,
        sheet.properties.sheetId,
    ]));
}

async function ensureBackupSheets(sheets, auth, spreadsheetId, backupSheets) {
    let sheetIds = await fetchSheetIds(sheets, auth, spreadsheetId);
    const missingSheets = backupSheets.filter(({ sheetName }) => !sheetIds.has(sheetName));

    if (missingSheets.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            auth,
            spreadsheetId,
            requestBody: {
                requests: missingSheets.map(({ sheetName }) => ({
                    addSheet: { properties: { title: sheetName } },
                })),
            },
        });
        sheetIds = await fetchSheetIds(sheets, auth, spreadsheetId);
    }

    return sheetIds;
}

export async function writeBackupAtomically(sheets, auth, spreadsheetId, backupSheets) {
    const sheetIds = await ensureBackupSheets(sheets, auth, spreadsheetId, backupSheets);
    const requests = createAtomicSheetUpdateRequests(backupSheets, sheetIds);

    await sheets.spreadsheets.batchUpdate({
        auth,
        spreadsheetId,
        requestBody: { requests },
    });
}
