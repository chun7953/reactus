import assert from 'node:assert/strict';
import test from 'node:test';

import { deliverAndRecordNotification } from '../src/lib/notificationDelivery.js';

test('deliverAndRecordNotification records only after delivery succeeds', async () => {
    const steps = [];
    const pool = {
        async query(sql, values) {
            steps.push('record');
            assert.match(sql, /^INSERT INTO notified_events/);
            assert.deepEqual(values, ['event-1']);
        },
    };

    const result = await deliverAndRecordNotification(pool, 'event-1', async () => {
        steps.push('deliver');
        return { id: 'message-1' };
    });

    assert.deepEqual(steps, ['deliver', 'record']);
    assert.deepEqual(result, { id: 'message-1' });
});

test('deliverAndRecordNotification leaves the event retryable when delivery fails', async () => {
    let recordCalls = 0;
    const pool = {
        async query() {
            recordCalls += 1;
        },
    };
    const deliveryError = new Error('Discord unavailable');

    await assert.rejects(
        deliverAndRecordNotification(pool, 'event-2', async () => {
            throw deliveryError;
        }),
        error => error === deliveryError,
    );

    assert.equal(recordCalls, 0);
});

test('deliverAndRecordNotification surfaces a failed notification record', async () => {
    const databaseError = new Error('database unavailable');
    let deliveryCalls = 0;
    const pool = {
        async query() {
            throw databaseError;
        },
    };

    await assert.rejects(
        deliverAndRecordNotification(pool, 'event-3', async () => {
            deliveryCalls += 1;
        }),
        error => error === databaseError,
    );

    assert.equal(deliveryCalls, 1);
});
