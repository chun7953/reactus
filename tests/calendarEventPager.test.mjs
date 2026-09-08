import assert from 'node:assert/strict';
import test from 'node:test';

import { listAllCalendarEvents } from '../src/lib/calendarEventPager.js';

test('collects every Calendar API page without losing parameters', async () => {
    const calls = [];
    const calendar = {
        events: {
            async list(params) {
                calls.push(params);
                if (!params.pageToken) {
                    return { data: { items: [{ id: '1' }, { id: '2' }], nextPageToken: 'next' } };
                }
                return { data: { items: [{ id: '3' }] } };
            },
        },
    };

    const result = await listAllCalendarEvents(calendar, {
        calendarId: 'calendar-1',
        timeMin: '2026-09-01T00:00:00Z',
        timeMax: '2027-09-01T00:00:00Z',
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'Asia/Tokyo',
    });

    assert.deepEqual(result.map(item => item.id), ['1', '2', '3']);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].maxResults, 250);
    assert.equal(calls[1].pageToken, 'next');
    assert.equal(calls[1].calendarId, 'calendar-1');
});
