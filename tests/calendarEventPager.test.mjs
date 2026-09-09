import assert from 'node:assert/strict';
import test from 'node:test';

import { listAllCalendarEvents } from '../src/lib/calendarEventPager.js';
import { resolveCalendarEventPrivateProperties } from '../src/lib/calendarEventMetadata.js';

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

test('prefetches unique recurring masters concurrently and lets metadata resolution reuse them', async () => {
    let masterCalls = 0;
    let active = 0;
    let maxActive = 0;
    const calendar = {
        events: {
            async list() {
                return {
                    data: {
                        items: [
                            { id: 'i1', recurringEventId: 'series-1' },
                            { id: 'i2', recurringEventId: 'series-1', extendedProperties: { private: { reactusMentionMode: 'none' } } },
                            { id: 'i3', recurringEventId: 'series-2' },
                        ],
                    },
                };
            },
            async get({ eventId }) {
                masterCalls += 1;
                active += 1;
                maxActive = Math.max(maxActive, active);
                await new Promise(resolve => setTimeout(resolve, 10));
                active -= 1;
                return {
                    data: {
                        extendedProperties: {
                            private: { reactusAssetId: `${eventId}-image`, reactusMentionMode: 'default' },
                        },
                    },
                };
            },
        },
    };

    const result = await listAllCalendarEvents(calendar, { calendarId: 'calendar-1' });
    assert.equal(masterCalls, 2);
    assert.ok(maxActive >= 2);

    const first = await resolveCalendarEventPrivateProperties(calendar, 'calendar-1', result[0]);
    const second = await resolveCalendarEventPrivateProperties(calendar, 'calendar-1', result[1]);
    const third = await resolveCalendarEventPrivateProperties(calendar, 'calendar-1', result[2]);

    assert.equal(masterCalls, 2);
    assert.equal(first.reactusAssetId, 'series-1-image');
    assert.equal(second.reactusAssetId, 'series-1-image');
    assert.equal(second.reactusMentionMode, 'none');
    assert.equal(third.reactusAssetId, 'series-2-image');
});
