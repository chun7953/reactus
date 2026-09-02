export class BackupValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BackupValidationError';
    }
}

export const BACKUP_SCHEMA_VERSION = '1';

const BACKUP_SECTIONS = [
    {
        key: 'reactions',
        sheetPrefix: 'Reactions',
        range: 'A1:D',
        headers: ['guild_id', 'channel_id', 'emojis', 'trigger'],
        requiredColumns: [1, 2, 3],
    },
    {
        key: 'announcements',
        sheetPrefix: 'Announcements',
        range: 'A1:C',
        headers: ['guild_id', 'channel_id', 'message'],
        requiredColumns: [1, 2],
    },
    {
        key: 'calendarMonitors',
        sheetPrefix: 'CalendarMonitors',
        range: 'A1:E',
        headers: ['guild_id', 'channel_id', 'calendar_id', 'trigger_keyword', 'mention_role'],
        requiredColumns: [1, 2, 3],
    },
    {
        key: 'guildConfigs',
        sheetPrefix: 'GuildConfigs',
        range: 'A1:C',
        headers: ['guild_id', 'main_calendar_id', 'giveaway_manager_roles'],
        requiredColumns: [],
    },
];

function isBlankRow(row) {
    return !Array.isArray(row) || row.every(value => value === undefined || value === null || value === '');
}

function headersMatch(actual, expected) {
    return expected.length === actual.length && expected.every((value, index) => actual[index] === value);
}

export function getBackupSheetSpecs(guildId) {
    if (!guildId) throw new Error('guildId is required');

    return BACKUP_SECTIONS.map(section => ({
        ...section,
        sheetName: `${section.sheetPrefix}_${guildId}`,
    }));
}

export function getBackupMetadataSpec(guildId) {
    if (!guildId) throw new Error('guildId is required');

    return {
        key: 'metadata',
        sheetName: `BackupMeta_${guildId}`,
        range: 'A1:D',
        headers: ['schema_version', 'guild_id', 'backup_id', 'completed_at'],
    };
}

export function validateBackup(guildId, sheetTitles, valueRanges) {
    const specs = getBackupSheetSpecs(guildId);
    const metadataSpec = getBackupMetadataSpec(guildId);
    const availableTitles = new Set(sheetTitles || []);
    const hasMetadata = availableTitles.has(metadataSpec.sheetName);
    const missingSheets = specs
        .filter(spec => !availableTitles.has(spec.sheetName))
        .map(spec => spec.sheetName);

    if (missingSheets.length > 0) {
        throw new BackupValidationError(
            `必須のバックアップシートがありません: ${missingSheets.join(', ')}`,
        );
    }

    const expectedRangeCount = specs.length + (hasMetadata ? 1 : 0);
    if (!Array.isArray(valueRanges) || valueRanges.length !== expectedRangeCount) {
        throw new BackupValidationError('バックアップシートをすべて読み込めませんでした。');
    }

    const data = {};
    const counts = {};

    specs.forEach((spec, index) => {
        const values = valueRanges[index]?.values || [];
        const header = values[0] || [];

        if (!headersMatch(header, spec.headers)) {
            throw new BackupValidationError(
                `${spec.sheetName} のヘッダーがバックアップ形式と一致しません。`,
            );
        }

        const rows = [];
        values.slice(1).forEach((row, rowIndex) => {
            if (isBlankRow(row)) return;

            if (String(row[0] ?? '') !== String(guildId)) {
                throw new BackupValidationError(
                    `${spec.sheetName} の${rowIndex + 2}行目に別サーバーのデータがあります。`,
                );
            }

            const hasMissingRequiredValue = spec.requiredColumns.some(columnIndex => (
                row[columnIndex] === undefined
                || row[columnIndex] === null
                || row[columnIndex] === ''
            ));
            if (hasMissingRequiredValue) {
                throw new BackupValidationError(
                    `${spec.sheetName} の${rowIndex + 2}行目に必須項目の不足があります。`,
                );
            }

            rows.push(row);
        });

        data[spec.key] = rows;
        counts[spec.key] = rows.length;
    });

    let metadata = null;
    if (hasMetadata) {
        const values = valueRanges[specs.length]?.values || [];
        const header = values[0] || [];
        const rows = values.slice(1).filter(row => !isBlankRow(row));

        if (!headersMatch(header, metadataSpec.headers) || rows.length !== 1) {
            throw new BackupValidationError('バックアップ世代情報が壊れています。');
        }

        const [schemaVersion, metadataGuildId, backupId, completedAt] = rows[0];
        if (
            String(schemaVersion ?? '') !== BACKUP_SCHEMA_VERSION
            || String(metadataGuildId ?? '') !== String(guildId)
            || !backupId
            || !completedAt
            || Number.isNaN(Date.parse(completedAt))
        ) {
            throw new BackupValidationError('バックアップ世代情報が無効です。');
        }

        metadata = {
            backupId: String(backupId),
            completedAt: String(completedAt),
        };
    }

    return {
        data,
        counts,
        isEmpty: Object.values(counts).every(count => count === 0),
        isLegacy: !hasMetadata,
        metadata,
    };
}
