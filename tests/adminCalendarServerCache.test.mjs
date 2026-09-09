import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  invalidateWebScheduleCache,
  webCalendarListCacheConfig,
} from '../src/lib/webCalendarAdmin.js';

const adminPath = new URL('../src/lib/webCalendarAdmin.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const mentionPath = new URL('../src/lib/webCalendarMentionService.js', import.meta.url);
const duplicatePath = new URL('../src/lib/webCalendarDuplicateService.js', import.meta.url);
const monitorPath = new URL('../src/lib/webCalendarMonitorService.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const reactionPaginationPath = new URL('../public/common/admin-reaction-pagination.js', import.meta.url);
const monitorLabelsPath = new URL('../public/common/admin-monitor-labels.js', import.meta.url);

test('admin calendar list cache shares the common dashboard window for one minute', () => {
  assert.deepEqual(webCalendarListCacheConfig, {
    ttlMs: 60_000,
    loadTimeoutMs: 28_000,
    sharedForwardDays: 90,
    sharedPastDays: 45,
  });
  assert.doesNotThrow(() => invalidateWebScheduleCache('guild-test'));
  assert.doesNotThrow(() => invalidateWebScheduleCache());
});

test('calendar cache deduplicates inflight loads, bounds cold loads, and rejects stale writes after mutation', async () => {
  const source = await readFile(adminPath, 'utf8');
  assert.match(source, /calendarListInflight = new Map\(\)/);
  assert.match(source, /calendarListGeneration = new Map\(\)/);
  assert.match(source, /calendarListInflight\.has\(key\)/);
  assert.match(source, /generationFor\(guildId\) === generation/);
  assert.match(source, /CALENDAR_LOAD_TIMEOUT_MS = 28_000/);
  assert.match(source, /withCalendarTimeout\(/);
  assert.match(source, /using stale cache/);
  assert.match(source, /\[WebAdminCalendar\] loaded/);
  assert.match(source, /SHARED_FORWARD_DAYS = 90/);
  assert.match(source, /SHARED_PAST_DAYS = 45/);
});

test('normal event reads use cache while refresh=1 forces a Google Calendar reload', async () => {
  const [adminSource, handlerSource] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(handlerPath, 'utf8'),
  ]);
  assert.match(adminSource, /\{ forceRefresh = false \} = \{\}/);
  assert.match(adminSource, /if \(!forceRefresh && cached/);
  assert.match(handlerSource, /const forceRefresh = searchParams\.get\('refresh'\) === '1'/);
  assert.match(handlerSource, /listWebSchedules\(auth\.session\.guild_id, days, pastDays, \{ forceRefresh \}\)/);
});

test('all schedule mutations that can change list output invalidate the cache', async () => {
  const [mention, duplicate, monitor] = await Promise.all([
    readFile(mentionPath, 'utf8'),
    readFile(duplicatePath, 'utf8'),
    readFile(monitorPath, 'utf8'),
  ]);
  assert.match(mention, /invalidateWebScheduleCache\(guildId\)/);
  assert.match(duplicate, /invalidateWebScheduleCache\(guildId\)/);
  assert.ok((monitor.match(/invalidateWebScheduleCache\(guildId\)/g) || []).length >= 3);
});

test('dashboard hides routing keywords and paginates long reaction-rule lists', async () => {
  const [entry, pagination, labels] = await Promise.all([
    readFile(futureScopePath, 'utf8'),
    readFile(reactionPaginationPath, 'utf8'),
    readFile(monitorLabelsPath, 'utf8'),
  ]);
  assert.match(entry, /admin-monitor-labels\.js/);
  assert.match(entry, /admin-reaction-pagination\.js/);
  assert.match(pagination, /REACTION_PAGE_SIZE = 8/);
  assert.match(pagination, /reactionRuleSearch/);
  assert.match(pagination, /← 前へ/);
  assert.match(pagination, /次へ →/);
  assert.match(labels, /split\(' — '\)\[0\]/);
  assert.match(labels, /抽選用の投稿先がありません/);
});
