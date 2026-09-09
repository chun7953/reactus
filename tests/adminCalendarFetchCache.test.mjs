import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const legacyCachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const adminPath = new URL('../public/admin.js', import.meta.url);
const editPath = new URL('../public/common/admin-calendar-edit.js', import.meta.url);
const dragPath = new URL('../public/common/admin-calendar-drag.js', import.meta.url);
const mobileDayPath = new URL('../public/common/admin-mobile-day-inline.js', import.meta.url);
const monthPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const shellPath = new URL('../public/common/admin-calendar-shell.js', import.meta.url);
const guardPath = new URL('../public/common/admin-calendar-load-guard.js', import.meta.url);
const foldPath = new URL('../public/common/admin-calendar-settings-fold.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const calendarAdminPath = new URL('../src/lib/webCalendarAdmin.js', import.meta.url);

test('admin no longer installs a browser-wide fetch cache or legacy calendar URL rewrite', async () => {
  const entrySource = await readFile(entryPath, 'utf8');
  assert.doesNotMatch(entrySource, /admin-event-fetch-cache\.js/);
  await assert.rejects(readFile(legacyCachePath, 'utf8'), error => error?.code === 'ENOENT');
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

test('explicit update asks the server to bypass the calendar cache directly', async () => {
  const [adminSource, monthSource, handlerSource, calendarSource] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(monthPath, 'utf8'),
    readFile(handlerPath, 'utf8'),
    readFile(calendarAdminPath, 'utf8'),
  ]);
  assert.match(adminSource, /loadEvents\(\{ forceRefresh = false \} = \{\}\)/);
  assert.match(adminSource, /forceRefresh \? '&refresh=1' : ''/);
  assert.match(adminSource, /loadEvents\(\{ forceRefresh: true \}\)/);
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
  const [entrySource, futureSource, shellSource, guardSource, htmlSource] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
    readFile(shellPath, 'utf8'),
    readFile(guardPath, 'utf8'),
    readFile(htmlPath, 'utf8'),
  ]);
  assert.match(entrySource, /admin-calendar-shell\.js/);
  assert.match(entrySource, /admin-calendar-month-view\.js/);
  assert.match(entrySource, /admin-mobile-day-inline\.js/);
  assert.match(entrySource, /admin-calendar-load-guard\.js/);
  assert.doesNotMatch(entrySource, /admin-event-fetch-cache\.js/);
  assert.doesNotMatch(futureSource, /admin-calendar-month-view\.js/);
  assert.doesNotMatch(futureSource, /admin-mobile-day-inline\.js/);
  assert.match(shellSource, /<h2>カレンダー<\/h2>/);
  assert.doesNotMatch(shellSource, /カレンダー表示/);
  assert.match(guardSource, /CALENDAR_STUCK_MS = 40000/);
  assert.match(guardSource, /カレンダーを再読み込み/);
  assert.match(htmlSource, /<script type="module" src="\/admin-entry\.js"><\/script>/);
  assert.doesNotMatch(htmlSource, /common\/admin-event-fetch-cache\.js/);
  assert.doesNotMatch(htmlSource, /<script type="module" src="\/admin\.js"/);
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
  assert.match(foldSource, /panel\.classList\.remove\('panel'\)/);
  assert.match(foldSource, /mount\.append\(panel\)/);
  assert.doesNotMatch(foldSource, /panel\.remove\(\)/);
});
