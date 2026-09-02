import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCalendarNotificationKey } from '../src/lib/calendarNotificationKey.js';

const monitor = {
    guild_id: 'guild-1',
    channel_id: 'channel-1',
    trigger_keyword: '予約',
};

test('buildCalendarNotificationKey is stable for one monitor and event', () => {
    const first = buildCalendarNotificationKey(monitor, 'event-1');
    const second = buildCalendarNotificationKey({ ...monitor }, 'event-1');

    assert.equal(first, second);
});

test('buildCalendarNotificationKey scopes delivery to each channel', () => {
    const first = buildCalendarNotificationKey(monitor, 'event-1');
    const second = buildCalendarNotificationKey(
        { ...monitor, channel_id: 'channel-2' },
        'event-1',
    );

    assert.notEqual(first, second);
});

test('buildCalendarNotificationKey avoids delimiter collisions', () => {
    const first = buildCalendarNotificationKey(
        { guild_id: 'a:b', channel_id: 'c', trigger_keyword: 'd' },
        'event',
    );
    const second = buildCalendarNotificationKey(
        { guild_id: 'a', channel_id: 'b:c', trigger_keyword: 'd' },
        'event',
    );

    assert.notEqual(first, second);
});

test('buildCalendarNotificationKey rejects incomplete identifiers', () => {
    assert.throws(
        () => buildCalendarNotificationKey({ ...monitor, channel_id: '' }, 'event-1'),
        /requires guild, channel, trigger, and event IDs/,
    );
});
