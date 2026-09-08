import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatWebDateTime,
    parseWebRecurrence,
    webScheduleDetail,
} from '../src/lib/webCalendarEditHelpers.js';

const monitor = {
    id: 7,
    calendar_id: 'calendar@example.test',
    channel_id: '123456789',
    trigger_keyword: 'ラキショ',
};

test('parseWebRecurrence restores five-week and monthly-last-weekday rules', () => {
    assert.deepEqual(
        parseWebRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=5;BYDAY=TU;COUNT=8']),
        { unit: 'week', interval: 5, weekdays: ['TU'], count: 8 },
    );

    assert.deepEqual(
        parseWebRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=-1SU']),
        { unit: 'month', interval: 1, monthlyWeek: 'last', monthlyWeekday: 'SU' },
    );
});

test('parseWebRecurrence restores month-end and JST end date', () => {
    assert.deepEqual(
        parseWebRecurrence(['RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20261231T145959Z']),
        { unit: 'month', interval: 1, monthlyDay: -1, until: '2026-12-31' },
    );
});

test('webScheduleDetail exposes every giveaway prize without a three-prize cap', () => {
    const event = {
        id: 'event-1',
        summary: '【ラキショ】景品A',
        description: [
            '【景品A/1】',
            '【景品B/2】',
            '【景品C/3】',
            '【景品D/4】',
            'お知らせ本文',
        ].join('\n'),
        start: { dateTime: '2026-09-20T20:00:00+09:00' },
        end: { dateTime: '2026-09-21T20:00:00+09:00' },
        recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=5;BYDAY=SU'],
        extendedProperties: {
            private: {
                reactusMentionMode: 'role',
                reactusMentionRoleId: '987654321',
                reactusAssetId: 'asset-id',
            },
        },
    };

    const detail = webScheduleDetail(event, monitor);
    assert.equal(detail.type, 'giveaway');
    assert.deepEqual(detail.prizes, [
        { name: '景品A', winners: 1 },
        { name: '景品B', winners: 2 },
        { name: '景品C', winners: 3 },
        { name: '景品D', winners: 4 },
    ]);
    assert.equal(detail.message, 'お知らせ本文');
    assert.deepEqual(detail.mention, { mode: 'role', roleId: '987654321' });
    assert.equal(detail.hasImage, true);
    assert.deepEqual(detail.recurrence, { unit: 'week', interval: 5, weekdays: ['SU'] });
});

test('webScheduleDetail exposes normal post title, body, duration and default mention', () => {
    const event = {
        id: 'event-2',
        summary: '【告知】定期投稿',
        description: '本文',
        start: { dateTime: '2026-09-20T10:00:00+09:00' },
        end: { dateTime: '2026-09-20T10:45:00+09:00' },
    };
    const detail = webScheduleDetail(event, { ...monitor, trigger_keyword: '告知' });
    assert.equal(detail.type, 'post');
    assert.equal(detail.title, '定期投稿');
    assert.equal(detail.body, '本文');
    assert.equal(detail.durationMinutes, 45);
    assert.deepEqual(detail.mention, { mode: 'default', roleId: null });
});

test('formatWebDateTime returns a datetime-local value in JST', () => {
    assert.equal(formatWebDateTime('2026-09-20T01:30:00Z'), '2026-09-20T10:30');
});