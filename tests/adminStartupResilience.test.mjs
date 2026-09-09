import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const authPath = new URL('../src/lib/webAdminAuth.js', import.meta.url);
const fetchCachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const startupPath = new URL('../public/common/admin-startup-resilience.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('admin bootstrap uses Discord gateway caches instead of refetching whole guild collections', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /const channels = auth\.guild\.channels\.cache/);
  assert.match(source, /const roles = auth\.guild\.roles\.cache/);
  assert.doesNotMatch(source, /auth\.guild\.channels\.fetch\(\),/);
  assert.doesNotMatch(source, /auth\.guild\.roles\.fetch\(\),/);
  assert.doesNotMatch(source, /auth\.guild\.emojis\.fetch\(\)/);
  assert.match(source, /client\.guilds\.cache\.get\(session\.guild_id\)/);
  assert.match(source, /guild\.members\.cache\.get\(session\.user_id\)/);
});

test('admin bootstrap has a bounded server-side wait', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /ADMIN_BOOTSTRAP_TIMEOUT_MS = 8000/);
  assert.match(source, /withTimeout\(/);
  assert.match(source, /初期情報の読み込みに時間がかかっています。再試行してください。/);
  assert.match(source, /error\.statusCode = 503/);
});

test('admin GET cache aborts stalled bootstrap and calendar requests', async () => {
  const source = await readFile(fetchCachePath, 'utf8');
  assert.match(source, /ADMIN_GET_TIMEOUT_MS = 12000/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /読み込みに時間がかかっています。再試行してください。/);
});

test('admin startup offers an explicit retry instead of an endless loading state', async () => {
  const [startup, entry] = await Promise.all([
    readFile(startupPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);
  assert.match(entry, /admin-startup-resilience\.js/);
  assert.match(startup, /STARTUP_GRACE_MS = 10500/);
  assert.match(startup, /reactusStartupRetry/);
  assert.match(startup, /再試行/);
  assert.match(startup, /window\.location\.reload\(\)/);
});

test('fresh web admin sessions are cached briefly to avoid an immediate extra DB round trip', async () => {
  const source = await readFile(authPath, 'utf8');
  assert.match(source, /SESSION_CACHE_TTL_MS = 30 \* 1000/);
  assert.match(source, /const sessionCache = new Map\(\)/);
  assert.match(source, /rememberSession\(sessionHash/);
  assert.match(source, /readCachedSession\(sessionHash\)/);
  assert.match(source, /sessionCache\.delete\(sessionHash\)/);
});
