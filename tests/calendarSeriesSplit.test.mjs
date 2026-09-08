import assert from 'node:assert/strict';
import test from 'node:test';

import {
    hasCountRule,
    recurrenceBeforeTarget,
    recurrenceForRemainingCount,
    recurringTargetStart,
} from '../src/lib/calendarSeriesSplit.js';

test('trims the original series immediately before the target instance', () => {
    const result = recurrenceBeforeTarget(
        ['RRULE:FREQ=WEEKLY;INTERVAL=5;BYDAY=SU;COUNT=12'],
        new Date('2026-09-20T10:00:00+09:00'),
    );
    assert.deepEqual(result, [
        'RRULE:FREQ=WEEKLY;INTERVAL=5;BYDAY=SU;UNTIL=20260920T005959Z',
    ]);
});

test('preserves non-RRULE recurrence entries while trimming the RRULE', () => {
    const result = recurrenceBeforeTarget(
        ['RRULE:FREQ=MONTHLY;BYDAY=-1SU', 'EXDATE:20261025T010000Z'],
        new Date('2026-11-29T10:00:00+09:00'),
    );
    assert.equal(result[0], 'RRULE:FREQ=MONTHLY;BYDAY=-1SU;UNTIL=20261129T005959Z');
    assert.equal(result[1], 'EXDATE:20261025T010000Z');
});

test('reduces COUNT for the new following series', () => {
    assert.deepEqual(
        recurrenceForRemainingCount(['RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=TU'], 3),
        ['RRULE:FREQ=WEEKLY;COUNT=7;BYDAY=TU'],
    );
    assert.equal(hasCountRule(['RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=TU']), true);
    assert.equal(hasCountRule(['RRULE:FREQ=WEEKLY;UNTIL=20261231T145959Z']), false);
});

test('uses originalStartTime rather than a moved exception start', () => {
    const result = recurringTargetStart({
        originalStartTime: { dateTime: '2026-10-04T10:00:00+09:00' },
        start: { dateTime: '2026-10-05T13:00:00+09:00' },
    });
    assert.equal(result.toISOString(), '2026-10-04T01:00:00.000Z');
});
