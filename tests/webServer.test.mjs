import assert from 'node:assert/strict';
import test from 'node:test';

import { closeHttpServer } from '../src/lib/gracefulShutdown.js';
import { createWebServer } from '../src/web/server.js';

async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
}

test('health endpoints distinguish liveness from readiness', async (t) => {
    let ready = false;
    const server = createWebServer({
        getStatus: () => ({ status: ready ? 'ok' : 'starting', ready }),
    });
    t.after(() => closeHttpServer(server));
    const baseUrl = await listen(server);

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'starting', ready: false });

    const unavailable = await fetch(`${baseUrl}/readyz`);
    assert.equal(unavailable.status, 503);

    ready = true;
    const available = await fetch(`${baseUrl}/readyz`);
    assert.equal(available.status, 200);
    assert.equal((await available.json()).ready, true);
});

test('web server rejects unsupported methods and traversal paths', async (t) => {
    const server = createWebServer();
    t.after(() => closeHttpServer(server));
    const baseUrl = await listen(server);

    assert.equal((await fetch(`${baseUrl}/healthz`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${baseUrl}/common/%2e%2e/package.json`)).status, 404);
});
