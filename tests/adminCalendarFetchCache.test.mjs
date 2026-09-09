import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const monthPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const shellPath = new URL('../public/common/admin-calendar-shell.js', import.meta.url);
const guardPath = new URL('../public/common/admin-calendar-load-guard.js', import.meta.url);
const foldPath = new URL('../public/common/admin-calendar-settings-fold.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);

test('admin calendar event cache deduplicates equal windows without forcing a year-wide load', async () => {
  const source = await readFile(cachePath, 'utf8');
  assert.match(source, /const cachedRequests = new Map\(\)/);
  assert.match(source, /const inflightRequests = new Map\(\)/);
  assert.match(source, /inflightRequests\.has\(key\)/);
  assert.match(source, /LEGACY_MONTH_DAYS = 45/);
  assert.match(source, /LEGACY_MONTH_PAST_DAYS = 40/);
  assert.match(source, /days >= 365/);
  assert.doesNotMatch(source, /CANONICAL_DAYS = 365/);
});

test('explicit update bypasses browser event cache while keeping concurrent refreshes single-flight', async () => {
  const source = await readFile(cachePath, 'utf8');
  assert.match(source, /EXPLICIT_REFRESH_WINDOW_MS = 2000/);
  assert.match(source, /beginExplicitCalendarRefresh\(\)/);
  assert.match(source, /closest\('#refreshEvents'\)/);
  assert.match(source, /normalized\.searchParams\.set\('refresh', '1'\)/);
  assert.match(source, /cachedEventRequest\(normalized, \{ forceRefresh \}\)/);
  assert.match(source, /if \(!forceRefresh && cached/);
  assert.match(source, /if \(inflightRequests\.has\(key\)\) return inflightRequests\.get\(key\)/);
});

test('initial admin bootstrap calls share one in-flight request', async () => {
  const source = await readFile(cachePath, 'utf8');
  assert.match(source, /BOOTSTRAP_CACHE_TTL_MS = 5000/);
  assert.match(source, /let cachedBootstrap = null/);
  assert.match(source, /let inflightBootstrap = null/);
  assert.match(source, /if \(inflightBootstrap\) return inflightBootstrap/);
  assert.match(source, /url\.pathname === '\/api\/admin\/bootstrap'/);
  assert.match(source, /invalidateBootstrap\(\)/);
});

test('month calendar loads a focused window and exposes days with more than six events', async () => {
  const source = await readFile(monthPath, 'utf8');
  assert.match(source, /MONTH_VISIBLE_EVENTS = 6/);
  assert.match(source, /requestWindowForMonth/);
  assert.match(source, /\/api\/admin\/events\?days=\$\{window\.days\}&pastDays=\$\{window\.pastDays\}/);
  assert.match(source, /ほか\$\{events\.length - MONTH_VISIBLE_EVENTS\}件/);
  assert.match(source, /reactusCalendarDayDialog/);
  assert.match(source, /openDayDialog\(day, events\)/);
});

test('calendar shell and month loader are bootstrap-critical instead of deferred behind optional UI', async () => {
  const [entrySource, futureSource, shellSource, guardSource, htmlSource] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
    readFile(shellPath, 'utf8'),
    readFile(guardPath, 'utf8'),
    readFile(htmlPath, 'utf8'),
  ]);
  assert.match(entrySource, /admin-calendar-shell\.js/);
  assert.match(entrySource, /admin-calendar-month-view\.js/);
  assert.match(entrySource, /admin-calendar-load-guard\.js/);
  assert.doesNotMatch(futureSource, /admin-calendar-month-view\.js/);
  assert.match(shellSource, /<h2>カレンダー<\/h2>/);
  assert.doesNotMatch(shellSource, /カレンダー表示/);
  assert.match(guardSource, /CALENDAR_STUCK_MS = 40000/);
  assert.match(guardSource, /カレンダーを再読み込み/);
  const cacheIndex = htmlSource.indexOf('/common/admin-event-fetch-cache.js');
  const adminIndex = htmlSource.indexOf('/admin.js');
  assert.ok(cacheIndex >= 0 && adminIndex > cacheIndex);
  assert.doesNotMatch(htmlSource, /admin-history\.js/);
  assert.doesNotMatch(htmlSource, /予定履歴/);
});

test('calendar integration settings fold into the calendar instead of using a separate full panel', async () => {
  const [futureSource, foldSource] = await Promise.all([
    readFile(futureScopePath, 'utf8'),
    readFile(foldPath, 'utf8'),
  ]);
  assert.match(futureSource, /admin-calendar-settings-fold\.js/);
  assert.match(foldSource, /#calendarOverview/);
  assert.match(foldSource, /#calendarSettingsPanel/);
  assert.match(foldSource, /カレンダー連携設定/);
  assert.match(foldSource, /mount\.append\(details\)/);
  assert.match(foldSource, /panel\.remove\(\)/);
});
