import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const enhancementsEntryPath = new URL('../public/admin-enhancements-entry.js', import.meta.url);
const observerGuardPath = new URL('../public/common/admin-observer-guard.js', import.meta.url);
const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const monthViewPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);

test('enhancement observers are deferred so DOM feedback cannot starve click handling', async () => {
  const [entry, guard] = await Promise.all([
    readFile(enhancementsEntryPath, 'utf8'),
    readFile(observerGuardPath, 'utf8'),
  ]);

  assert.ok(
    entry.indexOf("admin-observer-guard.js") < entry.indexOf("admin-tools.js"),
    'observer guard must load before enhancement modules',
  );
  assert.match(guard, /const NativeMutationObserver = window\.MutationObserver/);
  assert.match(guard, /window\.setTimeout\(\(\) => this\.flush\(\), 0\)/);
  assert.match(guard, /MAX_CALLBACKS_PER_SECOND = 60/);
  assert.match(guard, /runaway MutationObserver was disconnected/);
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
