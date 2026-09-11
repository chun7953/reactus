import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutoBackupCoordinator } from '../src/lib/autoBackup.js';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
}

test('a change arriving during backup waits for one trailing backup', async () => {
    const runs = [];
    const queueBackup = createAutoBackupCoordinator(guildId => {
        const run = deferred();
        runs.push({ guildId, run });
        return run.promise;
    });

    const first = queueBackup('guild-1');
    await flush();
    assert.equal(runs.length, 1);

    let secondResolved = false;
    const second = queueBackup('guild-1').then(result => {
        secondResolved = true;
        return result;
    });

    runs[0].run.resolve(true);
    assert.equal(await first, true);
    await flush();

    assert.equal(runs.length, 2, 'a later generation must receive a trailing backup');
    assert.equal(secondResolved, false, 'later changes must not be reported backed up by the older snapshot');

    runs[1].run.resolve(true);
    assert.equal(await second, true);
});

test('many overlapping changes collapse into one trailing backup generation', async () => {
    const runs = [];
    const queueBackup = createAutoBackupCoordinator(() => {
        const run = deferred();
        runs.push(run);
        return run.promise;
    });

    const first = queueBackup('guild-1');
    await flush();
    const later = [
        queueBackup('guild-1'),
        queueBackup('guild-1'),
        queueBackup('guild-1'),
    ];

    runs[0].resolve(true);
    assert.equal(await first, true);
    await flush();
    assert.equal(runs.length, 2, 'all newer generations should share one trailing snapshot');

    runs[1].resolve(true);
    assert.deepEqual(await Promise.all(later), [true, true, true]);
    assert.equal(runs.length, 2);
});

test('different guilds back up independently', async () => {
    const runs = new Map();
    const queueBackup = createAutoBackupCoordinator(guildId => {
        const run = deferred();
        runs.set(guildId, run);
        return run.promise;
    });

    const guildOne = queueBackup('guild-1');
    const guildTwo = queueBackup('guild-2');
    await flush();

    assert.deepEqual([...runs.keys()].sort(), ['guild-1', 'guild-2']);
    runs.get('guild-1').resolve(true);
    runs.get('guild-2').resolve(true);
    assert.deepEqual(await Promise.all([guildOne, guildTwo]), [true, true]);
});

test('a failed generation resolves false but does not strand a newer generation', async () => {
    const runs = [];
    const queueBackup = createAutoBackupCoordinator(() => {
        const run = deferred();
        runs.push(run);
        return run.promise;
    });

    const first = queueBackup('guild-1');
    await flush();
    const second = queueBackup('guild-1');

    runs[0].reject(new Error('temporary Sheets failure'));
    assert.equal(await first, false);
    await flush();
    assert.equal(runs.length, 2);

    runs[1].resolve(true);
    assert.equal(await second, true);
});

test('a new change after completion starts a fresh backup', async () => {
    let runs = 0;
    const queueBackup = createAutoBackupCoordinator(async () => {
        runs += 1;
        return true;
    });

    assert.equal(await queueBackup('guild-1'), true);
    assert.equal(await queueBackup('guild-1'), true);
    assert.equal(runs, 2);
});
