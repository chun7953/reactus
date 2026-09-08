import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildPrivatePropertiesPatch,
    currentEventWindow,
    editGiveawayDescription,
    hasRecurrenceEdit,
    parseGiveawayDescription,
    parseTriggeredSummary,
    rewriteTriggeredTitle,
} from '../src/lib/calendarEditHelpers.js';

test('parses and rewrites Reactus trigger-prefixed titles', () => {
    assert.deepEqual(parseTriggeredSummary('【レイド部】今夜の予定'), {
        trigger: 'レイド部',
        title: '今夜の予定',
    });
    assert.equal(rewriteTriggeredTitle('【レイド部】旧タイトル', '新タイトル'), '【レイド部】新タイトル');
});

test('rejects title rewriting for an unrelated calendar event', () => {
    assert.throws(() => rewriteTriggeredTitle('普通の予定', '新タイトル'), /監視キーワード/);
});

test('parses giveaway prizes separately from message text', () => {
    assert.deepEqual(parseGiveawayDescription('【小魔人の玉/5】\n【スキル支援ボックス/10】\n明日の抽選です'), {
        prizes: [
            { prize: '小魔人の玉', winners: 5 },
            { prize: 'スキル支援ボックス', winners: 10 },
        ],
        message: '明日の抽選です',
    });
});

test('edits one giveaway prize while preserving other prizes and message', () => {
    const result = editGiveawayDescription({
        description: '【A/1】\n【B/2】\n本文',
        prize: 'A+',
        winners: 3,
    });
    assert.deepEqual(result.prizes, [
        { prize: 'A+', winners: 3 },
        { prize: 'B', winners: 2 },
    ]);
    assert.equal(result.description, '【A+/3】\n【B/2】\n本文');
});

test('can remove all extra giveaway prizes and clear message', () => {
    const result = editGiveawayDescription({
        description: '【A/1】\n【B/2】\n本文',
        removeExtraPrizes: true,
        clearMessage: true,
    });
    assert.equal(result.description, '【A/1】');
    assert.deepEqual(result.prizes, [{ prize: 'A', winners: 1 }]);
});

test('requires complete data when adding a new giveaway prize', () => {
    assert.throws(() => editGiveawayDescription({
        description: '【A/1】',
        prize2: 'B',
    }), /景品2/);
});

test('updates mention and image metadata without losing unrelated private properties', () => {
    const result = buildPrivatePropertiesPatch({
        reactusMentionMode: 'role',
        reactusMentionRoleId: '111',
        reactusAssetId: 'old',
        keepMe: 'yes',
    }, {
        mention: true,
        assetMode: 'replace',
        assetId: 'new',
    });
    assert.deepEqual(result, {
        reactusMentionMode: 'default',
        reactusAssetId: 'new',
        keepMe: 'yes',
    });
});

test('can explicitly remove mention and image metadata without null map values', () => {
    const result = buildPrivatePropertiesPatch({
        reactusMentionMode: 'role',
        reactusMentionRoleId: '111',
        reactusAssetId: 'old',
    }, {
        mention: false,
        assetMode: 'remove',
    });
    assert.equal(result.reactusMentionMode, 'none');
    assert.equal('reactusMentionRoleId' in result, false);
    assert.equal('reactusAssetId' in result, false);
    assert.equal(Object.values(result).every(value => typeof value === 'string'), true);
});

test('detects whether recurrence options were actually supplied', () => {
    assert.equal(hasRecurrenceEdit({}), false);
    assert.equal(hasRecurrenceEdit({ interval: 5 }), true);
    assert.equal(hasRecurrenceEdit({ unit: 'month' }), true);
});

test('reads a valid event window and preserves its duration', () => {
    const result = currentEventWindow({
        start: { dateTime: '2026-09-08T21:00:00+09:00' },
        end: { dateTime: '2026-09-09T21:00:00+09:00' },
    });
    assert.equal(result.durationMs, 24 * 60 * 60 * 1000);
});
