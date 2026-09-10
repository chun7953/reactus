import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const authPath = new URL('../src/lib/webAdminAuth.js', import.meta.url);
const calendarAdminPath = new URL('../src/lib/webCalendarAdmin.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);
const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);

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

test('calendar loading is bounded by the server-owned persistent cache layer', async () => {
  const source = await readFile(calendarAdminPath, 'utf8');
  assert.match(source, /CALENDAR_LOAD_TIMEOUT_MS = 28_000/);
  assert.match(source, /withCalendarTimeout\(/);
  assert.match(source, /calendarListInflight = new Map\(\)/);
  assert.match(source, /readPersistedSnapshot/);
  assert.match(source, /refresh failed; using stale memory cache/);
  assert.match(source, /refresh failed; using persisted cache/);
});

test('admin has a static startup shell that remains visible even if module JavaScript fails', async () => {
  const [html, entry] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);
  assert.match(html, /id="startupShell"/);
  assert.match(html, /管理画面を読み込んでいます/);
  assert.match(html, /id="startupShellRetry"/);
  assert.match(html, /12500/);
  assert.match(html, /window\.location\.reload\(\)/);
  assert.doesNotMatch(entry, /admin-startup-resilience\.js/);
  assert.doesNotMatch(entry, /admin-bootstrap-fallback\.js/);
});

test('fresh web admin sessions are cached briefly to avoid an immediate extra DB round trip', async () => {
  const source = await readFile(authPath, 'utf8');
  assert.match(source, /SESSION_CACHE_TTL_MS = 30 \* 1000/);
  assert.match(source, /const sessionCache = new Map\(\)/);
  assert.match(source, /rememberSession\(sessionHash/);
  assert.match(source, /readCachedSession\(sessionHash\)/);
  assert.match(source, /sessionCache\.delete\(sessionHash\)/);
});
