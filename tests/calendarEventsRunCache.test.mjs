import assert from 'node:assert/strict';
import test from 'node:test';

import { createCalendarEventsRunLoader } from '../src/lib/calendarEventsRunCache.js';

function createCalendar({ failFirst = false } = {}) {
  const calls = [];
  let attempts = 0;
  return {
    calls,
    calendar: {
      events: {
        async list(options) {
          calls.push(options);
          attempts += 1;
          if (failFirst && attempts === 1) throw new Error('temporary calendar failure');
          return { data: { items: [{ id: `event-${options.calendarId}` }] } };
        },
      },
    },
  };
}

test('same calendar is listed only once during one monitor run', async () => {
  const { calendar, calls } = createCalendar();
  const listEvents = createCalendarEventsRunLoader(calendar, {
    timeMin: '2026-09-11T00:00:00.000Z',
    timeMax: '2026-09-11T00:20:00.000Z',
    singleEvents: true,
  });

  const first = await listEvents('calendar-a');
  const second = await listEvents('calendar-a');

  assert.strictEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].calendarId, 'calendar-a');
});

test('different calendars keep separate API calls', async () => {
  const { calendar, calls } = createCalendar();
  const listEvents = createCalendarEventsRunLoader(calendar, { singleEvents: true });

  await listEvents('calendar-a');
  await listEvents('calendar-b');

  assert.deepEqual(calls.map(call => call.calendarId), ['calendar-a', 'calendar-b']);
});

test('failed calendar list is not cached and can retry in the same run', async () => {
  const { calendar, calls } = createCalendar({ failFirst: true });
  const listEvents = createCalendarEventsRunLoader(calendar, { singleEvents: true });

  await assert.rejects(() => listEvents('calendar-a'), /temporary calendar failure/);
  const result = await listEvents('calendar-a');

  assert.equal(calls.length, 2);
  assert.equal(result.data.items[0].id, 'event-calendar-a');
});
