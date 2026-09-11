import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    INDEXNOW_ENDPOINT,
    INDEXNOW_KEY_FILE,
    SITE_ORIGIN,
    parseSitemapUrls,
    selectChangedUrls,
    submitIndexNow,
} from '../scripts/submit-indexnow.mjs';

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://reactus.fly.dev/</loc></url>
  <url><loc>https://reactus.fly.dev/reference.html</loc></url>
  <url><loc>https://reactus.fly.dev/privacy.html?x=1&amp;y=2</loc></url>
  <url><loc>https://example.com/not-reactus</loc></url>
</urlset>`;

test('parseSitemapUrls keeps unique same-origin HTTPS URLs', () => {
    assert.deepEqual(parseSitemapUrls(sitemap), [
        'https://reactus.fly.dev/',
        'https://reactus.fly.dev/reference.html',
        'https://reactus.fly.dev/privacy.html?x=1&y=2',
    ]);
});

test('selectChangedUrls submits only changed HTML pages unless a shared public asset changed', () => {
    const urls = [
        'https://reactus.fly.dev/',
        'https://reactus.fly.dev/reference.html',
        'https://reactus.fly.dev/privacy.html',
    ];

    assert.deepEqual(
        selectChangedUrls(['public/reference.html', 'src/lib/example.js'], urls),
        ['https://reactus.fly.dev/reference.html'],
    );
    assert.deepEqual(selectChangedUrls(['public/common/css/import_screen.css'], urls), urls);
    assert.deepEqual(selectChangedUrls(['public/llms-full.txt'], urls), []);
});

test('submitIndexNow verifies the live key and sitemap before posting the URL list', async (t) => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reactus-indexnow-'));
    const publicDir = path.join(repoRoot, 'public');
    await fs.mkdir(publicDir);
    const key = INDEXNOW_KEY_FILE.replace(/\.txt$/, '');
    await fs.writeFile(path.join(publicDir, INDEXNOW_KEY_FILE), `${key}\n`, 'utf8');
    t.after(() => fs.rm(repoRoot, { recursive: true, force: true }));

    const postedBodies = [];
    const fetchImpl = async (url, options = {}) => {
        if (url === `${SITE_ORIGIN}/${INDEXNOW_KEY_FILE}`) {
            return new Response(`${key}\n`, { status: 200 });
        }
        if (url === `${SITE_ORIGIN}/sitemap.xml`) {
            return new Response(sitemap, { status: 200 });
        }
        if (url === INDEXNOW_ENDPOINT) {
            postedBodies.push(JSON.parse(options.body));
            return new Response('', { status: 202 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await submitIndexNow({ forceAll: true, fetchImpl, repoRoot });
    assert.equal(result.submitted, true);
    assert.equal(result.status, 202);
    assert.equal(postedBodies.length, 1);
    assert.deepEqual(postedBodies[0], {
        host: 'reactus.fly.dev',
        key,
        keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY_FILE}`,
        urlList: [
            'https://reactus.fly.dev/',
            'https://reactus.fly.dev/reference.html',
            'https://reactus.fly.dev/privacy.html?x=1&y=2',
        ],
    });
});
