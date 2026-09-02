import assert from 'node:assert/strict';
import test from 'node:test';
import { closeHttpServer, createGracefulShutdown } from '../src/lib/gracefulShutdown.js';

function createTimerHarness() {
    let callback;
    let cleared = false;
    return {
        setTimeoutFn(fn) {
            callback = fn;
            return { unref() {} };
        },
        clearTimeoutFn() { cleared = true; },
        fire() { callback(); },
        wasCleared() { return cleared; },
    };
}

const silentLogger = { error() {}, log() {}, warn() {} };

test('graceful shutdown closes resources in order and runs only once', async () => {
    const calls = [];
    const exits = [];
    const timer = createTimerHarness();
    const shutdown = createGracefulShutdown({
        client: { destroy: () => calls.push('discord') },
        server: {
            listening: true,
            close(callback) {
                calls.push('http');
                callback();
            },
        },
        stopMonitoring: async ({ timeoutMs }) => {
            calls.push(`monitor:${timeoutMs}`);
            return true;
        },
        closeDatabase: async () => { calls.push('database'); },
        exit: code => exits.push(code),
        logger: silentLogger,
        taskDrainTimeoutMs: 1234,
        ...timer,
    });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    assert.equal(first, second);
    assert.equal(await first, 0);
    assert.deepEqual(calls, ['monitor:1234', 'discord', 'http', 'database']);
    assert.deepEqual(exits, [0]);
    assert.equal(timer.wasCleared(), true);
});

test('graceful shutdown continues after a resource error and exits with failure', async () => {
    const calls = [];
    const exits = [];
    const timer = createTimerHarness();
    const shutdown = createGracefulShutdown({
        client: {
            destroy() {
                calls.push('discord');
                throw new Error('disconnect failed');
            },
        },
        server: { listening: false },
        stopMonitoring: async () => { calls.push('monitor'); return true; },
        closeDatabase: async () => { calls.push('database'); },
        exit: code => exits.push(code),
        logger: silentLogger,
        ...timer,
    });

    assert.equal(await shutdown('SIGTERM'), 1);
    assert.deepEqual(calls, ['monitor', 'discord', 'database']);
    assert.deepEqual(exits, [1]);
});

test('graceful shutdown force-exits only once when its deadline is reached', async () => {
    const exits = [];
    const timer = createTimerHarness();
    let releaseMonitoring;
    const monitoringStopped = new Promise(resolve => { releaseMonitoring = resolve; });
    const shutdown = createGracefulShutdown({
        client: { destroy() {} },
        server: { listening: false },
        stopMonitoring: () => monitoringStopped,
        closeDatabase: async () => {},
        exit: code => exits.push(code),
        logger: silentLogger,
        ...timer,
    });

    const result = shutdown('SIGTERM');
    timer.fire();
    assert.deepEqual(exits, [1]);

    releaseMonitoring(true);
    assert.equal(await result, 0);
    assert.deepEqual(exits, [1]);
});

test('closeHttpServer is a no-op when the server is not listening', async () => {
    await closeHttpServer(undefined);
    await closeHttpServer({ listening: false });
});
