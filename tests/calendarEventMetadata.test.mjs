import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCalendarEventPrivateProperties } from '../src/lib/calendarEventMetadata.js';

test('returns instance private properties directly for one-off events', async () => {
    let calls = 0;
    const calendar = {
        events: {
            async get() {
                calls += 1;
                return { data: {} };
            },
        },
    };
    const result = await resolveCalendarEventPrivateProperties(
        calendar,
        'calendar@example.com',
        { extendedProperties: { private: { reactusAssetId: 'asset-1' } } },
    );
    assert.deepEqual(result, { reactusAssetId: 'asset-1' });
    assert.equal(calls, 0);
});

test('inherits master metadata for expanded recurring instances and lets instance values override it', async () => {
    const calendar = {
        events: {
            async get({ calendarId, eventId }) {
                assert.equal(calendarId, 'calendar@example.com');
                assert.equal(eventId, 'series-1');
                return {
                    data: {
                        extendedProperties: {
                            private: {
                                reactusAssetId: 'master-image',
                                reactusMentionMode: 'custom',
                                reactusMentionTargets: 'r:123,u:456',
                            },
                        },
                    },
                };
            },
        },
    };
    const result = await resolveCalendarEventPrivateProperties(
        calendar,
        'calendar@example.com',
        {
            recurringEventId: 'series-1',
            extendedProperties: {
                private: {
                    reactusMentionMode: 'none',
                },
            },
        },
    );
    assert.deepEqual(result, {
        reactusAssetId: 'master-image',
        reactusMentionMode: 'none',
        reactusMentionTargets: 'r:123,u:456',
    });
});

test('caches one master lookup across multiple instances in the same monitor run', async () => {
    let calls = 0;
    const calendar = {
        events: {
            async get() {
                calls += 1;
                return {
                    data: {
                        extendedProperties: { private: { reactusAssetId: 'shared-image' } },
                    },
                };
            },
        },
    };
    const cache = new Map();
    const first = await resolveCalendarEventPrivateProperties(
        calendar,
        'calendar@example.com',
        { id: 'instance-1', recurringEventId: 'series-1' },
        cache,
    );
    const second = await resolveCalendarEventPrivateProperties(
        calendar,
        'calendar@example.com',
        { id: 'instance-2', recurringEventId: 'series-1' },
        cache,
    );
    assert.equal(calls, 1);
    assert.equal(first.reactusAssetId, 'shared-image');
    assert.equal(second.reactusAssetId, 'shared-image');
});

test('falls back to instance metadata if the master lookup fails', async () => {
    const calendar = {
        events: {
            async get() {
                throw new Error('temporary Calendar API failure');
            },
        },
    };
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const result = await resolveCalendarEventPrivateProperties(
            calendar,
            'calendar@example.com',
            {
                recurringEventId: 'series-1',
                extendedProperties: { private: { reactusMentionMode: 'none' } },
            },
        );
        assert.deepEqual(result, { reactusMentionMode: 'none' });
    } finally {
        console.warn = originalWarn;
    }
});
