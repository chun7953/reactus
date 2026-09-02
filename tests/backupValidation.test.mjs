import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BackupValidationError,
    getBackupSheetSpecs,
    validateBackup,
} from '../src/lib/backupValidation.js';

const guildId = '123456789';
const specs = getBackupSheetSpecs(guildId);
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
