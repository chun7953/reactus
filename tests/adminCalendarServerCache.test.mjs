import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  invalidateWebScheduleCache,
  webCalendarListCacheConfig,
} from '../src/lib/webCalendarAdmin.js';

const adminPath = new URL('../src/lib/webCalendarAdmin.js', import.meta.url);
const snapshotPath = new URL('../src/lib/calendarAdminSnapshotStore.js', import.meta.url);
const readyPath = new URL('../src/events/ready.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const mentionPath = new URL('../src/lib/webCalendarMentionService.js', import.meta.url);
const duplicatePath = new URL('../src/lib/webCalendarDuplicateService.js', import.meta.url);
const monitorPath = new URL('../src/lib/webCalendarMonitorService.js', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const reactionPaginationPath = new URL('../public/common/admin-reaction-pagination.js', import.meta.url);
const adminUiPath = new URL('../public/admin.js', import.meta.url);

test('admin calendar list cache shares the common dashboard window and persists snapshots', () => {
  assert.deepEqual(webCalendarListCacheConfig, {
    ttlMs: 60_000,
    loadTimeoutMs: 28_000,
    sharedForwardDays: 90,
    sharedPastDays: 45,
    persistent: true,
    staleWhileRevalidate: true,
  });
  assert.doesNotThrow(() => invalidateWebScheduleCache());
});

test('calendar cache uses stale-while-revalidate and survives Fly deploys through PostgreSQL', async () => {
  const [source, snapshot, ready] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(snapshotPath, 'utf8'),
    readFile(readyPath, 'utf8'),
  ]);
  assert.match(source, /calendarListInflight = new Map\(\)/);
  assert.match(source, /calendarListGeneration = new Map\(\)/);
  assert.match(source, /calendarListInflight\.has\(key\)/);
  assert.match(source, /generationFor\(guildId\) === generation/);
  assert.match(source, /CALENDAR_LOAD_TIMEOUT_MS = 28_000/);
  assert.match(source, /withCalendarTimeout\(/);
  assert.match(source, /readPersistedSnapshot/);
  assert.match(source, /void refreshSnapshot\(guildId, window\)\.catch/);
  assert.match(source, /using stale memory cache/);
  assert.match(source, /using persisted cache/);
  assert.match(source, /writeCalendarAdminSnapshot/);
  assert.match(source, /warmAllWebScheduleCaches/);
  assert.match(snapshot, /CREATE TABLE IF NOT EXISTS web_calendar_snapshots/);
  assert.match(snapshot, /events JSONB NOT NULL/);
  assert.match(snapshot, /ON CONFLICT \(guild_id, forward_days, past_days\)/);
  assert.match(ready, /warmAllWebScheduleCaches\(\)/);
});

test('normal event reads use cache while refresh=1 forces a Google Calendar reload', async () => {
  const [adminSource, handlerSource] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(handlerPath, 'utf8'),
  ]);
  assert.match(adminSource, /if \(forceRefresh\) return refreshSnapshot\(guildId, window\)/);
  assert.match(adminSource, /if \(cached\)/);
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

test('dashboard core owns destination labels and reaction rules remain paginated', async () => {
  const [enhancementModules, pagination, adminUi] = await Promise.all([
    readFile(enhancementModulesPath, 'utf8'),
    readFile(reactionPaginationPath, 'utf8'),
    readFile(adminUiPath, 'utf8'),
  ]);
  assert.doesNotMatch(enhancementModules, /admin-monitor-labels\.js/);
  assert.doesNotMatch(enhancementModules, /admin-post-destinations\.js/);
  assert.match(enhancementModules, /admin-reaction-pagination\.js/);
  assert.doesNotMatch(enhancementModules, /admin-panel-layout\.js/);
  assert.match(pagination, /REACTION_PAGE_SIZE = 8/);
  assert.match(pagination, /reactionRuleSearch/);
  assert.match(pagination, /← 前へ/);
  assert.match(pagination, /次へ →/);
  assert.match(adminUi, /function monitorLabel\(/);
  assert.match(adminUi, /monitor\.canManage !== true/);
  assert.match(adminUi, /抽選用の投稿先がありません/);
});
