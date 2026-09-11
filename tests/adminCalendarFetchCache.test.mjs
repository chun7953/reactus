import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const legacyCachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const legacyGuardPath = new URL('../public/common/admin-calendar-load-guard.js', import.meta.url);
const adminPath = new URL('../public/admin.js', import.meta.url);
const editPath = new URL('../public/common/admin-calendar-edit.js', import.meta.url);
const dragPath = new URL('../public/common/admin-calendar-drag.js', import.meta.url);
const mobileDayPath = new URL('../public/common/admin-mobile-day-inline.js', import.meta.url);
const monthPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const shellPath = new URL('../public/common/admin-calendar-shell.js', import.meta.url);
const settingsPath = new URL('../public/common/admin-calendar-settings.js', import.meta.url);
const retiredFoldPath = new URL('../public/common/admin-calendar-settings-fold.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const calendarAdminPath = new URL('../src/lib/webCalendarAdmin.js', import.meta.url);

test('admin no longer installs browser-wide calendar request wrappers or external load guards', async () => {
  const entrySource = await readFile(entryPath, 'utf8');
  assert.doesNotMatch(entrySource, /admin-event-fetch-cache\.js/);
  assert.doesNotMatch(entrySource, /admin-calendar-load-guard\.js/);
  await assert.rejects(readFile(legacyCachePath, 'utf8'), error => error?.code === 'ENOENT');
  await assert.rejects(readFile(legacyGuardPath, 'utf8'), error => error?.code === 'ENOENT');
});

test('month view owns event-list data and edit, drag, and mobile day do not refetch it', async () => {
  const [monthSource, editSource, dragSource, mobileDaySource] = await Promise.all([
    readFile(monthPath, 'utf8'),
    readFile(editPath, 'utf8'),
    readFile(dragPath, 'utf8'),
    readFile(mobileDayPath, 'utf8'),
  ]);

  assert.match(monthSource, /dataset\.reactusEventId = String\(event\.id \|\| ''\)/);
  assert.match(monthSource, /dataset\.reactusCalendarId = String\(event\.calendarId \|\| ''\)/);
  assert.match(monthSource, /dataset\.reactusEventStart = String\(event\.start \|\| ''\)/);
  assert.match(monthSource, /dataset\.reactusRecurringEventId = String\(event\.recurringEventId \|\| ''\)/);
  assert.match(monthSource, /dataset\.reactusEventSummary = String\(event\.summary \|\| ''\)/);
  assert.match(monthSource, /export function getMonthEventsForDay\(key\)/);

  for (const source of [editSource, dragSource, mobileDaySource]) {
    assert.doesNotMatch(source, /\/api\/admin\/events/);
  }
  for (const source of [editSource, dragSource]) {
    assert.match(source, /dataset\.reactusEventId/);
    assert.match(source, /dataset\.reactusCalendarId/);
  }
  assert.match(dragSource, /dataset\.reactusEventStart/);
  assert.match(dragSource, /dataset\.reactusRecurringEventId/);
  assert.match(mobileDaySource, /getMonthEventsForDay\(key\)/);
});

test('month view owns request timeout, error rendering, retry, and explicit cache bypass', async () => {
  const [adminSource, monthSource, handlerSource, calendarSource] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(monthPath, 'utf8'),
    readFile(handlerPath, 'utf8'),
    readFile(calendarAdminPath, 'utf8'),
  ]);
  assert.match(adminSource, /loadEvents\(\{ forceRefresh = false \} = \{\}\)/);
  assert.match(adminSource, /forceRefresh \? '&refresh=1' : ''/);
  assert.match(adminSource, /loadEvents\(\{ forceRefresh: true \}\)/);
  assert.match(monthSource, /MONTH_REQUEST_TIMEOUT_MS = 40_000/);
  assert.match(monthSource, /const controller = new AbortController\(\)/);
  assert.match(monthSource, /controller\.abort\(\)/);
  assert.match(monthSource, /signal: controller\.signal/);
  assert.match(monthSource, /window\.clearTimeout\(timeoutId\)/);
  assert.match(monthSource, /カレンダーの読み込みがタイムアウトしました/);
  assert.match(monthSource, /function showMonthError\(error\)/);
  assert.match(monthSource, /カレンダーを再読み込み/);
  assert.match(monthSource, /loadOwnedMonth\(\{ quiet = false, forceRefresh = false \} = \{\}\)/);
  assert.match(monthSource, /forceRefresh \? '&refresh=1' : ''/);
  assert.match(monthSource, /loadOwnedMonth\(\{ forceRefresh: true \}\)/);
  assert.match(handlerSource, /const forceRefresh = searchParams\.get\('refresh'\) === '1'/);
  assert.match(handlerSource, /listWebSchedules\(auth\.session\.guild_id, days, pastDays, \{ forceRefresh \}\)/);
  assert.match(calendarSource, /if \(forceRefresh\) return refreshSnapshot\(guildId, window\)/);
  assert.match(calendarSource, /calendarListInflight\.has\(key\)/);
});

test('month calendar loads a focused window and exposes days with more than six events', async () => {
  const source = await readFile(monthPath, 'utf8');
  assert.match(source, /MONTH_VISIBLE_EVENTS = 6/);
  assert.match(source, /requestWindowForMonth/);
  assert.match(source, /\/api\/admin\/events\?days=\$\{window\.days\}&pastDays=\$\{window\.pastDays\}\$\{refreshQuery\}/);
  assert.match(source, /ほか\$\{events\.length - MONTH_VISIBLE_EVENTS\}件/);
  assert.match(source, /reactusCalendarDayDialog/);
  assert.match(source, /openDayDialog\(day, events\)/);
});

test('calendar shell and month-owned consumers are bootstrap-critical instead of deferred behind optional UI', async () => {
  const [entrySource, enhancementModulesSource, shellSource, htmlSource] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(enhancementModulesPath, 'utf8'),
    readFile(shellPath, 'utf8'),
    readFile(htmlPath, 'utf8'),
  ]);
  assert.match(entrySource, /admin-calendar-shell\.js/);
  assert.match(entrySource, /admin-calendar-month-view\.js/);
  assert.match(entrySource, /admin-mobile-day-inline\.js/);
  assert.doesNotMatch(entrySource, /admin-calendar-load-guard\.js/);
  assert.doesNotMatch(entrySource, /admin-event-fetch-cache\.js/);
  assert.doesNotMatch(enhancementModulesSource, /admin-calendar-month-view\.js/);
  assert.doesNotMatch(enhancementModulesSource, /admin-mobile-day-inline\.js/);
  assert.match(shellSource, /<h2>カレンダー<\/h2>/);
  assert.doesNotMatch(shellSource, /カレンダー表示/);
  assert.match(htmlSource, /<script type="module" src="\/admin-entry\.js"><\/script>/);
  assert.doesNotMatch(htmlSource, /common\/admin-event-fetch-cache\.js/);
  assert.doesNotMatch(htmlSource, /<script type="module" src="\/admin\.js"/);
  assert.doesNotMatch(htmlSource, /admin-history\.js/);
  assert.doesNotMatch(htmlSource, /予定履歴/);
});

test('calendar settings owner renders the final folded UI directly into the calendar shell', async () => {
  const [enhancementModulesSource, shellSource, settingsSource] = await Promise.all([
    readFile(enhancementModulesPath, 'utf8'),
    readFile(shellPath, 'utf8'),
    readFile(settingsPath, 'utf8'),
  ]);
  assert.match(shellSource, /id="calendarSettingsMount"/);
  assert.match(settingsSource, /const mount = q\('#calendarSettingsMount'\)/);
  assert.match(settingsSource, /panel\.className = 'reactus-calendar-settings-fold'/);
  assert.match(settingsSource, /<summary>カレンダー連携設定<\/summary>/);
  assert.match(settingsSource, /普段は変更不要です。Googleカレンダーや投稿先を変更するときだけ開いてください。/);
  assert.match(settingsSource, /mount\.append\(panel\)/);
  assert.doesNotMatch(settingsSource, /firstPanel\.after\(panel\)/);
  assert.doesNotMatch(enhancementModulesSource, /admin-calendar-settings-fold\.js/);
  await assert.rejects(readFile(retiredFoldPath, 'utf8'), error => error?.code === 'ENOENT');
});
