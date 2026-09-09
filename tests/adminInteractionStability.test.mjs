import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const enhancementsEntryPath = new URL('../public/admin-enhancements-entry.js', import.meta.url);
const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const monthViewPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);
const announcementsPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('admin enhancements do not replace the browser MutationObserver implementation', async () => {
  const [entry, announcements, futureScope] = await Promise.all([
    readFile(enhancementsEntryPath, 'utf8'),
    readFile(announcementsPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
  ]);

  assert.doesNotMatch(entry, /admin-observer-guard\.js/);
  assert.doesNotMatch(entry, /window\.MutationObserver\s*=/);
  assert.doesNotMatch(announcements, /observe\(document\.documentElement/);
  assert.doesNotMatch(futureScope, /admin-panel-layout\.js/);
});

test('the month calendar has one renderer and admin tools no longer replace its DOM', async () => {
  const [tools, monthView] = await Promise.all([
    readFile(toolsPath, 'utf8'),
    readFile(monthViewPath, 'utf8'),
  ]);

  assert.doesNotMatch(tools, /function renderMonth\(/);
  assert.doesNotMatch(tools, /function loadCalendarEvents\(/);
  assert.doesNotMatch(tools, /\/api\/admin\/events\?days=365/);
  assert.match(tools, /month calendar is owned exclusively by admin-calendar-month-view\.js/);
  assert.match(monthView, /function renderOwnedMonth\(/);
});

test('duplicate calendar hover layer is not loaded in the enhancement bundle', async () => {
  const entry = await readFile(enhancementsEntryPath, 'utf8');
  assert.doesNotMatch(entry, /admin-calendar-polish\.js/);
});
