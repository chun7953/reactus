import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mobilePath = new URL('../public/common/admin-mobile.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('mobile admin module is loaded from the dashboard entry chain', async () => {
  const entry = await readFile(entryPath, 'utf8');
  assert.match(entry, /admin-mobile\.js/);
});

test('mobile admin keeps a compact seven-column month calendar with tap day counts', async () => {
  const source = await readFile(mobilePath, 'utf8');
  assert.match(source, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
  assert.match(source, /reactus-mobile-event-count/);
  assert.match(source, /currentMore\.click\(\)/);
  assert.match(source, /openCompactDay\(cell, currentEvents\)/);
});

test('mobile admin provides touch-friendly navigation and compact forms', async () => {
  const source = await readFile(mobilePath, 'utf8');
  assert.match(source, /reactusMobileNav/);
  assert.match(source, /\['calendarOverview', '予定'\]/);
  assert.match(source, /\['schedulePanel', '作成'\]/);
  assert.match(source, /min-height:46px/);
  assert.match(source, /font-size:16px/);
  assert.match(source, /details\.recurrence/);
  assert.match(source, /details\.open = false/);
});
