import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMovedSchedulePayload } from '../src/lib/webCalendarMoveService.js';

function baseDetail(overrides = {}) {
    return {
        id: 'event-1',
        requestedEventId: 'event-1',
        calendarId: 'calendar@example.com',
        monitorId: 7,
        type: 'post',
        startTime: '2026-09-10T21:00',
        endTime: '2026-09-10T21:30',
        title: 'お知らせ',
        body: '本文',
        mention: {
            mode: 'custom',
            targets: [
                { type: 'role', id: '123456789012345678' },
                { type: 'here' },
            ],
        },
        originalWasRecurring: false,
        recurringEventId: null,
        isRecurringMaster: false,
        ...overrides,
    };
}

test('moves a one-off post to another date while preserving time and content', () => {
    const payload = buildMovedSchedulePayload(baseDetail(), '2026-09-15');

    assert.equal(payload.startTime, '2026-09-15T21:00');
    assert.equal(payload.durationMinutes, 30);
    assert.equal(payload.title, 'お知らせ');
    assert.equal(payload.body, '本文');
    assert.deepEqual(payload.mention, baseDetail().mention);
    assert.equal(payload.imageMode, 'keep');
    assert.deepEqual(payload.recurrence, { unit: 'once', interval: 1 });
});

test('moves a one-off giveaway and preserves its full duration across days', () => {
    const detail = baseDetail({
        type: 'giveaway',
        startTime: '2026-09-10T21:00',
        endTime: '2026-09-11T21:00',
        prizes: [
            { name: '景品A', winners: 1 },
            { name: '景品B', winners: 3 },
        ],
        message: '応募してください',
        title: undefined,
        body: undefined,
    });

    const payload = buildMovedSchedulePayload(detail, '2026-10-01');
    assert.equal(payload.startTime, '2026-10-01T21:00');
    assert.equal(payload.endTime, '2026-10-02T21:00');
    assert.deepEqual(payload.prizes, detail.prizes);
    assert.equal(payload.message, '応募してください');
});

test('rejects drag moves for recurring schedules', () => {
    assert.throws(
        () => buildMovedSchedulePayload(baseDetail({
            originalWasRecurring: true,
            recurringEventId: 'series-1',
        }), '2026-09-15'),
        /定期予定はドラッグ移動できません/,
    );
});

test('rejects impossible target dates', () => {
    assert.throws(
        () => buildMovedSchedulePayload(baseDetail(), '2026-02-30'),
        /移動先の日付が正しくありません/,
    );
});
