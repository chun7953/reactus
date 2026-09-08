import test from 'node:test';
import assert from 'node:assert/strict';

import { createAsyncCache } from '../src/lib/asyncCache.js';

test('returns a cached value until TTL expires', async () => {
    let currentTime = 1000;
    let loads = 0;
    const cache = createAsyncCache({ ttlMs: 100, now: () => currentTime });
    const loader = async () => ++loads;

    assert.equal(await cache.get('key', loader), 1);
    assert.equal(await cache.get('key', loader), 1);
    assert.equal(loads, 1);

    currentTime = 1101;
    assert.equal(await cache.get('key', loader), 2);
    assert.equal(loads, 2);
});

test('caches undefined results for negative lookups', async () => {
    let loads = 0;
    const cache = createAsyncCache({ ttlMs: 100 });
    const loader = async () => {
        loads += 1;
        return undefined;
    };

    assert.equal(await cache.get('missing', loader), undefined);
    assert.equal(await cache.get('missing', loader), undefined);
    assert.equal(loads, 1);
});

test('deduplicates concurrent loads for the same key', async () => {
    let release;
    let loads = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const cache = createAsyncCache();
    const loader = async () => {
        loads += 1;
        await gate;
        return 'value';
    };

    const first = cache.get('key', loader);
    const second = cache.get('key', loader);
    release();

    assert.equal(await first, 'value');
    assert.equal(await second, 'value');
    assert.equal(loads, 1);
});

test('does not cache loader failures', async () => {
    let loads = 0;
    const cache = createAsyncCache();
    const loader = async () => {
        loads += 1;
        if (loads === 1) throw new Error('temporary');
        return 'recovered';
    };

    await assert.rejects(cache.get('key', loader), /temporary/);
    assert.equal(await cache.get('key', loader), 'recovered');
    assert.equal(loads, 2);
});

test('supports exact and predicate invalidation', async () => {
    const cache = createAsyncCache();
    await cache.get('reaction:g1', async () => 1);
    await cache.get('announcement:g1:c1', async () => 2);
    await cache.get('announcement:g2:c1', async () => 3);

    assert.equal(cache.invalidate('reaction:g1'), true);
    assert.equal(cache.invalidateWhere(key => key.startsWith('announcement:g1:')), 1);
    assert.equal(cache.size(), 1);
});

test('an invalidated in-flight load cannot repopulate stale data', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const cache = createAsyncCache();

    const staleLoad = cache.get('key', async () => {
        await gate;
        return 'old';
    });
    cache.invalidate('key');
    release();
    assert.equal(await staleLoad, 'old');

    let freshLoads = 0;
    assert.equal(await cache.get('key', async () => {
        freshLoads += 1;
        return 'new';
    }), 'new');
    assert.equal(freshLoads, 1);
});
