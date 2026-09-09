import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compatPath = new URL('../public/admin-compat.js', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const fetchCachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const serverPath = new URL('../src/web/server.js', import.meta.url);
const dockerPath = new URL('../Dockerfile', import.meta.url);

test('admin injects a classic compatibility loader before module-only UI code', async () => {
  const [compat, server] = await Promise.all([
    readFile(compatPath, 'utf8'),
    readFile(serverPath, 'utf8'),
  ]);

  assert.match(server, /admin-compat\.js/);
  assert.match(server, /admin\.bundle\.js/);
  assert.match(server, /window\.__reactusAdminAssetQuery/);
  assert.match(server, /<noscript>/);
  assert.match(compat, /modernSyntaxSupported/);
  assert.match(compat, /Function\('var x=\{a:\{b:1\}\}; return x\?\.a\?\.b \?\? 0;'\)/);
  assert.match(compat, /この端末向けの互換表示を読み込んでいます。/);
  assert.match(compat, /FALLBACK_MS = 12500/);
  assert.doesNotMatch(compat, /=>/);
  assert.doesNotMatch(compat, /\bconst\b/);
  assert.doesNotMatch(compat, /\blet\b/);
});

test('production image builds the admin compatibility bundle for older Android Chrome', async () => {
  const [entry, docker] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(dockerPath, 'utf8'),
  ]);

  assert.match(entry, /admin-event-fetch-cache\.js/);
  assert.match(entry, /\.\/admin\.js/);
  assert.match(entry, /admin-tools\.js/);
  assert.match(entry, /admin-calendar-polish\.js/);
  assert.match(entry, /admin-future-scope\.js/);
  assert.match(docker, /esbuild@0\.25\.9/);
  assert.match(docker, /--target=chrome61/);
  assert.match(docker, /--outfile=public\/admin\.bundle\.js/);
});

test('legacy compatibility path polyfills browser helpers used by admin modules', async () => {
  const compat = await readFile(compatPath, 'utf8');
  assert.match(compat, /Object\.fromEntries/);
  assert.match(compat, /Array\.prototype\.flatMap/);
  assert.match(compat, /String\.prototype\.replaceAll/);
});

test('admin fetch wrapper degrades safely when AbortController is unavailable', async () => {
  const source = await readFile(fetchCachePath, 'utf8');
  assert.match(source, /typeof AbortController === 'function'/);
  assert.match(source, /if \(controller\) requestOptions\.signal = controller\.signal/);
  assert.match(source, /if \(timer !== null\) window\.clearTimeout\(timer\)/);
});
