import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const monthPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
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

test('focused month helper is loaded and schedule history UI remains removed', async () => {
  const [futureSource, htmlSource] = await Promise.all([
    readFile(futureScopePath, 'utf8'),
    readFile(htmlPath, 'utf8'),
  ]);
  assert.match(futureSource, /admin-calendar-month-view\.js/);
  const cacheIndex = htmlSource.indexOf('/common/admin-event-fetch-cache.js');
  const adminIndex = htmlSource.indexOf('/admin.js');
  assert.ok(cacheIndex >= 0 && adminIndex > cacheIndex);
  assert.doesNotMatch(htmlSource, /admin-history\.js/);
  assert.doesNotMatch(htmlSource, /予定履歴/);
});
