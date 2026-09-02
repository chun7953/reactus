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
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runs, 1);
    assert.equal(callbacks.length, 1);

    assert.equal(await controller.stop(), true);
    assert.deepEqual(cleared, [1]);
});

test('monitor controller prevents overlapping executions of one task', async () => {
    const activeRun = deferred();
    let intervalCallback;
    let runs = 0;
    let block = false;
    const controller = createMonitorController([
        {
            name: 'slow',
            intervalMs: 1000,
            run: async () => {
                runs += 1;
                if (block) await activeRun.promise;
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
    await new Promise(resolve => setImmediate(resolve));
    block = true;
    intervalCallback();
    await Promise.resolve();
    intervalCallback();
    await Promise.resolve();
    assert.equal(runs, 2);

    activeRun.resolve();
    assert.equal(await controller.stop(), true);
});

test('monitor controller runs startup tasks sequentially', async () => {
    const firstRun = deferred();
    const runs = [];
    const controller = createMonitorController([
        {
            name: 'first',
            intervalMs: 1000,
            run: async () => {
                runs.push('first');
                await firstRun.promise;
            },
        },
        {
            name: 'second',
            intervalMs: 2000,
            run: async () => { runs.push('second'); },
        },
    ], {
        setIntervalFn: () => 1,
        clearIntervalFn() {},
        logger: silentLogger,
    });

    controller.start({});
    const ready = controller.whenReady();
    await Promise.resolve();
    assert.deepEqual(runs, ['first']);

    firstRun.resolve();
    await ready;
    assert.deepEqual(runs, ['first', 'second']);
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
    let block = false;
    const controller = createMonitorController([
        {
            name: 'blocked',
            intervalMs: 1000,
            run: () => {
                runs += 1;
                return block ? new Promise(() => {}) : undefined;
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
    await new Promise(resolve => setImmediate(resolve));
    block = true;
    intervalCallback();
    await Promise.resolve();
    assert.equal(await controller.stop({ timeoutMs: 50, pollIntervalMs: 10 }), false);
    intervalCallback();
    await Promise.resolve();
    assert.equal(runs, 2);
});

test('monitor controller exposes task runs, failures, and lifecycle state', async () => {
    let clock = 1000;
    const controller = createMonitorController([
        {
            name: 'observable',
            intervalMs: 5000,
            run: async () => {
                clock += 25;
                throw new Error('expected failure');
            },
        },
    ], {
        setIntervalFn: () => 1,
        clearIntervalFn() {},
        now: () => clock,
        logger: silentLogger,
    });

    controller.start({});
    await new Promise(resolve => setImmediate(resolve));
    const status = controller.getStatus();
    assert.equal(status.started, true);
    assert.equal(status.initializing, false);
    assert.deepEqual(status.activeTasks, []);
    assert.equal(status.tasks[0].runs, 1);
    assert.equal(status.tasks[0].failures, 1);
    assert.equal(status.tasks[0].lastDurationMs, 25);
    assert.match(status.tasks[0].lastFailedAt, /^1970-/);
    await controller.stop();
});
