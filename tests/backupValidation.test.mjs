import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BACKUP_SCHEMA_VERSION,
    BackupValidationError,
    getBackupMetadataSpec,
    getBackupSheetSpecs,
    validateBackup,
} from '../src/lib/backupValidation.js';

const guildId = '123456789';
const specs = getBackupSheetSpecs(guildId);
const metadataSpec = getBackupMetadataSpec(guildId);
const sheetTitles = specs.map(spec => spec.sheetName);

function createValueRanges(rows = {}) {
    return specs.map(spec => ({
        values: [spec.headers, ...(rows[spec.key] || [])],
    }));
}

test('validateBackup accepts a complete backup and reports its counts', () => {
    const result = validateBackup(guildId, sheetTitles, createValueRanges({
        reactions: [[guildId, 'channel-1', '👍', 'keyword']],
        announcements: [[guildId, 'channel-2', 'message']],
        calendarMonitors: [[guildId, 'channel-3', 'calendar-1', 'event', 'role-1']],
        guildConfigs: [[guildId, 'main-calendar', 'role-1']],
    }));

    assert.deepEqual(result.counts, {
        reactions: 1,
        announcements: 1,
        calendarMonitors: 1,
        guildConfigs: 1,
    });
    assert.equal(result.isEmpty, false);
    assert.equal(result.isLegacy, true);
    assert.equal(result.metadata, null);
});

test('validateBackup accepts generation metadata for an atomic backup', () => {
    const completedAt = '2026-09-02T12:34:56.000Z';
    const valueRanges = createValueRanges();
    valueRanges.push({
        values: [
            metadataSpec.headers,
            [BACKUP_SCHEMA_VERSION, guildId, 'backup-123', completedAt],
        ],
    });

    const result = validateBackup(
        guildId,
        [...sheetTitles, metadataSpec.sheetName],
        valueRanges,
    );

    assert.equal(result.isLegacy, false);
    assert.deepEqual(result.metadata, { backupId: 'backup-123', completedAt });
});

test('validateBackup rejects invalid generation metadata', () => {
    const valueRanges = createValueRanges();
    valueRanges.push({
        values: [
            metadataSpec.headers,
            ['999', guildId, 'backup-123', 'not-a-date'],
        ],
    });

    assert.throws(
        () => validateBackup(
            guildId,
            [...sheetTitles, metadataSpec.sheetName],
            valueRanges,
        ),
        error => (
            error instanceof BackupValidationError
            && error.message.includes('世代情報')
        ),
    );
});

test('validateBackup rejects a missing required sheet', () => {
    assert.throws(
        () => validateBackup(guildId, sheetTitles.slice(1), createValueRanges()),
        error => (
            error instanceof BackupValidationError
            && error.message.includes(specs[0].sheetName)
        ),
    );
});

test('validateBackup rejects an unexpected header', () => {
    const valueRanges = createValueRanges();
    valueRanges[1].values[0] = ['guild_id', 'wrong_column', 'message'];

    assert.throws(
        () => validateBackup(guildId, sheetTitles, valueRanges),
        error => (
            error instanceof BackupValidationError
            && error.message.includes('ヘッダー')
        ),
    );
});

test('validateBackup rejects data belonging to another guild', () => {
    const valueRanges = createValueRanges({
        reactions: [['other-guild', 'channel-1', '👍', 'keyword']],
    });

    assert.throws(
        () => validateBackup(guildId, sheetTitles, valueRanges),
        error => (
            error instanceof BackupValidationError
            && error.message.includes('別サーバー')
        ),
    );
});

test('validateBackup rejects a row with missing required data', () => {
    const valueRanges = createValueRanges({
        announcements: [[guildId, 'channel-2', '']],
    });

    assert.throws(
        () => validateBackup(guildId, sheetTitles, valueRanges),
        error => (
            error instanceof BackupValidationError
            && error.message.includes('必須項目')
        ),
    );
});

test('validateBackup accepts an intentionally empty backup', () => {
    const valueRanges = createValueRanges({ reactions: [[]] });
    const result = validateBackup(guildId, sheetTitles, valueRanges);

    assert.deepEqual(result.counts, {
        reactions: 0,
        announcements: 0,
        calendarMonitors: 0,
        guildConfigs: 0,
    });
    assert.equal(result.isEmpty, true);
});
