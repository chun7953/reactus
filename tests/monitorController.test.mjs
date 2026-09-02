import assert from 'node:assert/strict';
import test from 'node:test';
import { createMonitorController } from '../src/lib/monitorController.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

const silentLogger = { error() {}, warn() {} };

test('monitor controller starts each task once and ignores duplicate starts', async () => {
    const callbacks = [];
    const cleared = [];
    let runs = 0;
    const controller = createMonitorController([
        { name: 'fast', intervalMs: 1000, run: async () => { runs += 1; } },
    ], {
        setIntervalFn(callback) {
            callbacks.push(callback);
            return callbacks.length;
        },
        clearIntervalFn: handle => cleared.push(handle),
        logger: silentLogger,
    });

    assert.equal(controller.start({}), true);
    assert.equal(controller.start({}), false);
    await Promise.resolve();
    assert.equal(runs, 1);
    assert.equal(callbacks.length, 1);

    assert.equal(await controller.stop(), true);
    assert.deepEqual(cleared, [1]);
});

test('monitor controller prevents overlapping executions of one task', async () => {
    const activeRun = deferred();
    let intervalCallback;
    let runs = 0;
    const controller = createMonitorController([
        {
            name: 'slow',
            intervalMs: 1000,
            run: async () => {
                runs += 1;
                await activeRun.promise;
            },
        },
    ], {
        setIntervalFn(callback) {
            intervalCallback = callback;
            return 1;
        },
        clearIntervalFn() {},
        logger: silentLogger,
    });

    controller.start({});
    await Promise.resolve();
    intervalCallback();
    await Promise.resolve();
    assert.equal(runs, 1);

    activeRun.resolve();
    assert.equal(await controller.stop(), true);
});

test('monitor controller waits for active tasks during shutdown', async () => {
    const activeRun = deferred();
    let waits = 0;
    const controller = createMonitorController([
        { name: 'slow', intervalMs: 1000, run: () => activeRun.promise },
    ], {
        setIntervalFn: () => 1,
        clearIntervalFn() {},
        wait: async () => {
            waits += 1;
            activeRun.resolve();
            await Promise.resolve();
        },
        logger: silentLogger,
    });

    controller.start({});
    await Promise.resolve();
    assert.equal(await controller.stop({ timeoutMs: 100 }), true);
    assert.ok(waits >= 1);
});

test('monitor controller reports a drain timeout without starting new work', async () => {
    let clock = 0;
    let intervalCallback;
    let runs = 0;
    const controller = createMonitorController([
        {
            name: 'blocked',
            intervalMs: 1000,
            run: () => {
                runs += 1;
                return new Promise(() => {});
            },
        },
    ], {
        setIntervalFn(callback) {
            intervalCallback = callback;
            return 1;
        },
        clearIntervalFn() {},
        now: () => clock,
        wait: async delayMs => { clock += delayMs; },
        logger: silentLogger,
    });

    controller.start({});
    await Promise.resolve();
    assert.equal(await controller.stop({ timeoutMs: 50, pollIntervalMs: 10 }), false);
    intervalCallback();
    await Promise.resolve();
    assert.equal(runs, 1);
});
