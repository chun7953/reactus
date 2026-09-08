import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDuplicatedEventBody,
    mergeDuplicatePrivateProperties,
} from '../src/lib/calendarDuplicateHelpers.js';

test('buildDuplicatedEventBody preserves duration and content but not recurrence', () => {
    const source = {
        summary: '【投稿】お知らせ',
        description: '本文',
        start: { dateTime: '2026-09-01T10:00:00+09:00' },
        end: { dateTime: '2026-09-01T10:30:00+09:00' },
        recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=5'],
        extendedProperties: {
            private: {
                reactusMentionMode: 'role',
                reactusMentionRoleId: '1234567890',
                reactusAssetId: 'old-asset',
            },
        },
    };

    const body = buildDuplicatedEventBody(source, new Date('2026-10-06T12:00:00+09:00'), { assetId: 'new-asset' });

    assert.equal(body.summary, source.summary);
    assert.equal(body.description, source.description);
    assert.equal(body.start.dateTime, '2026-10-06T12:00:00+09:00');
    assert.equal(body.end.dateTime, '2026-10-06T12:30:00+09:00');
    assert.equal(body.recurrence, undefined);
    assert.deepEqual(body.extendedProperties.private, {
        reactusMentionMode: 'role',
        reactusMentionRoleId: '1234567890',
        reactusAssetId: 'new-asset',
    });
});

test('buildDuplicatedEventBody removes a stale image reference when no cloned asset exists', () => {
    const source = {
        summary: '【ラキショ】景品A',
        description: '【景品A/1】\n【景品B/2】\n追加本文',
        start: { dateTime: '2026-09-01T10:00:00+09:00' },
        end: { dateTime: '2026-09-02T10:00:00+09:00' },
        extendedProperties: { private: { reactusAssetId: 'old-asset', reactusMentionMode: 'none' } },
    };

    const body = buildDuplicatedEventBody(source, new Date('2026-09-10T10:00:00+09:00'));
    assert.equal(body.end.dateTime, '2026-09-11T10:00:00+09:00');
    assert.equal(body.description, source.description);
    assert.equal(body.extendedProperties.private.reactusAssetId, undefined);
    assert.equal(body.extendedProperties.private.reactusMentionMode, 'none');
});

test('mergeDuplicatePrivateProperties inherits master metadata while instance overrides it', () => {
    assert.deepEqual(
        mergeDuplicatePrivateProperties(
            {
                reactusMentionMode: 'role',
                reactusMentionRoleId: '1111111111',
                reactusAssetId: 'master-image',
            },
            {
                reactusMentionMode: 'none',
            },
        ),
        {
            reactusMentionMode: 'none',
            reactusAssetId: 'master-image',
        },
    );
});

test('buildDuplicatedEventBody rejects an invalid source window', () => {
    assert.throws(() => buildDuplicatedEventBody({
        start: { dateTime: '2026-09-01T10:00:00+09:00' },
        end: { dateTime: '2026-09-01T09:00:00+09:00' },
    }, new Date('2026-09-10T10:00:00+09:00')), /予定時間/);
});
