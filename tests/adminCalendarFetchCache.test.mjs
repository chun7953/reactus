import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);

test('admin calendar event requests share one canonical in-flight load', async () => {
  const source = await readFile(cachePath, 'utf8');
  assert.match(source, /let inflight = null/);
  assert.match(source, /if \(inflight\) return inflight/);
  assert.match(source, /days=\$\{CANONICAL_DAYS\}&pastDays=\$\{CANONICAL_PAST_DAYS\}/);
  assert.match(source, /CANONICAL_PAST_DAYS = 45/);
  assert.match(source, /url\.searchParams\.has\('pastDays'\)/);
  assert.match(source, /days >= 365 \? CANONICAL_PAST_DAYS : 0/);
});

test('calendar request cache loads before admin modules and schedule history UI is removed', async () => {
  const source = await readFile(htmlPath, 'utf8');
  const cacheIndex = source.indexOf('/common/admin-event-fetch-cache.js');
  const adminIndex = source.indexOf('/admin.js');
  assert.ok(cacheIndex >= 0 && adminIndex > cacheIndex);
  assert.doesNotMatch(source, /admin-history\.js/);
  assert.doesNotMatch(source, /予定履歴/);
});
