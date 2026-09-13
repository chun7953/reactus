import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createCalendarEventsRunLoader } from '../src/lib/calendarEventsRunCache.js';
import { createProviderTelemetry } from '../src/lib/providerTelemetry.js';

const taskMonitorPath = new URL('../src/lib/taskMonitor.js', import.meta.url);

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
          if (failFirst && attempts === 1) {
            const error = new Error('temporary calendar failure');
            error.response = { status: 429 };
            throw error;
          }
          return { data: { items: [{ id: `event-${options.calendarId}` }] } };
        },
      },
    },
  };
}

function createTelemetry() {
  return createProviderTelemetry({ now: () => Date.parse('2026-09-13T00:00:00.000Z') });
}

test('same calendar is listed only once during one monitor run', async () => {
  const { calendar, calls } = createCalendar();
  const telemetry = createTelemetry();
  const listEvents = createCalendarEventsRunLoader(calendar, {
    timeMin: '2026-09-11T00:00:00.000Z',
    timeMax: '2026-09-11T00:20:00.000Z',
    singleEvents: true,
  }, { telemetry });

  const first = await listEvents('calendar-a');
  const second = await listEvents('calendar-a');

  assert.strictEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].calendarId, 'calendar-a');
  assert.equal(telemetry.snapshot().googleCalendarMonitor.listRequests, 1);
  assert.equal(telemetry.snapshot().googleCalendarMonitor.listFailures, 0);
});

test('different calendars keep separate API calls', async () => {
  const { calendar, calls } = createCalendar();
  const telemetry = createTelemetry();
  const listEvents = createCalendarEventsRunLoader(
    calendar,
    { singleEvents: true },
    { telemetry },
  );

  await listEvents('calendar-a');
  await listEvents('calendar-b');

  assert.deepEqual(calls.map(call => call.calendarId), ['calendar-a', 'calendar-b']);
  assert.equal(telemetry.snapshot().googleCalendarMonitor.listRequests, 2);
});

test('failed calendar list is not cached and can retry in the same run', async () => {
  const { calendar, calls } = createCalendar({ failFirst: true });
  const telemetry = createTelemetry();
  const listEvents = createCalendarEventsRunLoader(
    calendar,
    { singleEvents: true },
    { telemetry },
  );

  await assert.rejects(() => listEvents('calendar-a'), /temporary calendar failure/);
  const result = await listEvents('calendar-a');

  assert.equal(calls.length, 2);
  assert.equal(result.data.items[0].id, 'event-calendar-a');
  assert.equal(telemetry.snapshot().googleCalendarMonitor.listRequests, 2);
  assert.equal(telemetry.snapshot().googleCalendarMonitor.listFailures, 1);
  assert.equal(telemetry.snapshot().googleCalendarMonitor.lastFailureStatus, 429);
  assert.equal(
    telemetry.snapshot().googleCalendarMonitor.lastFailureAt,
    '2026-09-13T00:00:00.000Z',
  );
});

test('task monitor delegates calendar listing to the per-run loader', async () => {
  const source = await readFile(taskMonitorPath, 'utf8');

  assert.match(source, /createCalendarEventsRunLoader\(calendar,/);
  assert.match(source, /listCalendarEvents\(monitor\.calendar_id\)/);
  assert.doesNotMatch(source, /calendar\.events\.list\(/);
});
