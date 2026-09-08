import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRecurrence,
    formatJstDateTime,
    parseJstDateTime,
    parseWeekdays,
} from '../src/lib/calendarScheduling.js';

test('parses and formats JST date/time without timezone drift', () => {
    const date = parseJstDateTime('2026-09-19 22:05');
    assert.ok(date instanceof Date);
    assert.equal(date.toISOString(), '2026-09-19T13:05:00.000Z');
    assert.equal(formatJstDateTime(date), '2026-09-19T22:05:00+09:00');
});

test('rejects impossible JST dates', () => {
    assert.equal(parseJstDateTime('2026-02-31 22:00'), null);
});

test('normalizes Japanese and English weekday names', () => {
    assert.deepEqual(parseWeekdays('月, 水, fri,月'), ['MO', 'WE', 'FR']);
});

test('builds every five weeks recurrence', () => {
    assert.deepEqual(buildRecurrence({
        unit: 'week',
        interval: 5,
        weekdays: '日',
    }), ['RRULE:FREQ=WEEKLY;INTERVAL=5;BYDAY=SU']);
});

test('builds last Sunday of every month recurrence', () => {
    assert.deepEqual(buildRecurrence({
        unit: 'month',
        monthlyWeek: 'last',
        monthlyWeekday: 'SU',
    }), ['RRULE:FREQ=MONTHLY;BYDAY=-1SU']);
});

test('builds second Tuesday of every month recurrence', () => {
    assert.deepEqual(buildRecurrence({
        unit: 'month',
        monthlyWeek: 'second',
        monthlyWeekday: 'TU',
    }), ['RRULE:FREQ=MONTHLY;BYDAY=2TU']);
});

test('builds last day of every month recurrence', () => {
    assert.deepEqual(buildRecurrence({
        unit: 'month',
        monthlyDay: -1,
    }), ['RRULE:FREQ=MONTHLY;BYMONTHDAY=-1']);
});

test('supports occurrence-count ending', () => {
    assert.deepEqual(buildRecurrence({
        unit: 'year',
        interval: 2,
        count: 7,
    }), ['RRULE:FREQ=YEARLY;INTERVAL=2;COUNT=7']);
});

test('supports end-date ending in JST', () => {
    const start = parseJstDateTime('2026-09-19 22:00');
    assert.deepEqual(buildRecurrence({
        unit: 'week',
        interval: 1,
        until: '2026-12-31',
        start,
    }), ['RRULE:FREQ=WEEKLY;UNTIL=20261231T145959Z']);
});

test('rejects simultaneous recurrence count and end date', () => {
    assert.throws(() => buildRecurrence({
        unit: 'week',
        until: '2026-12-31',
        count: 5,
    }), /どちらか一方/);
});

test('rejects invalid recurrence end dates', () => {
    assert.throws(() => buildRecurrence({
        unit: 'week',
        until: '2026-02-31',
    }), /正しくありません/);
});

test('rejects monthly-only options for other units', () => {
    assert.throws(() => buildRecurrence({
        unit: 'week',
        monthlyDay: -1,
    }), /月.*詳細指定/);
});
