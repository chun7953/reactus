import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeStatus } from '../src/lib/runtimeStatus.js';

test('runtime status exposes readiness without secret configuration values', () => {
    let clock = 1000;
    const status = createRuntimeStatus({ now: () => clock });

    status.setComponent('config', 'ready');
    status.setComponent('http', 'ready');
    status.setComponent('modules', 'ready');
    status.setComponent('database', 'ready');
    status.setComponent('discord', 'ready');
    status.setComponent('monitoring', 'ready');
    clock = 4500;
    status.markReady();

    assert.deepEqual(status.snapshot(), {
        status: 'ok',
        ready: true,
        phase: 'ready',
        uptime_seconds: 3,
        components: {
            config: 'ready',
            http: 'ready',
            modules: 'ready',
            database: 'ready',
            discord: 'ready',
            monitoring: 'ready',
        },
    });
});

test('runtime status reports startup failure and shutdown states', () => {
    const status = createRuntimeStatus();
    status.markFailed('database');
    assert.equal(status.snapshot().ready, false);
    assert.equal(status.snapshot().components.database, 'failed');

    status.markStopping();
    assert.equal(status.snapshot().phase, 'stopping');
});
