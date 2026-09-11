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

test('production web server serves public search discovery routes with correct content types', async (t) => {
    const server = createWebServer();
    t.after(() => closeHttpServer(server));
    const baseUrl = await listen(server);

    const cases = [
        ['/privacy.html', 'text/html; charset=utf-8', 'プライバシーポリシー'],
        ['/discord-scheduled-posts.html', 'text/html; charset=utf-8', 'Discordの予約投稿'],
        ['/discord-google-calendar.html', 'text/html; charset=utf-8', 'Google Calendar'],
        ['/discord-giveaway-bot.html', 'text/html; charset=utf-8', '複数景品'],
        ['/robots.txt', 'text/plain; charset=utf-8', 'Sitemap: https://reactus.fly.dev/sitemap.xml'],
        ['/sitemap.xml', 'application/xml; charset=utf-8', '<urlset'],
        ['/llms.txt', 'text/plain; charset=utf-8', '# Reactus'],
    ];

    for (const [pathname, contentType, expectedText] of cases) {
        const response = await fetch(`${baseUrl}${pathname}`);
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get('content-type'), contentType, pathname);
        assert.match(await response.text(), new RegExp(expectedText), pathname);
    }
});

test('web server rejects unsupported methods and traversal paths', async (t) => {
    const server = createWebServer();
    t.after(() => closeHttpServer(server));
    const baseUrl = await listen(server);

    assert.equal((await fetch(`${baseUrl}/healthz`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${baseUrl}/common/%2e%2e/package.json`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/package.json`)).status, 404);
});
