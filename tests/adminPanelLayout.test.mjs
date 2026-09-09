import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layoutPath = new URL('../public/common/admin-panel-layout.js', import.meta.url);

test('announcement panel remains a top-level sibling after calendar settings are folded', async () => {
  const source = await readFile(layoutPath, 'utf8');
  assert.match(source, /const calendar = document\.querySelector\('#calendarOverview'\)/);
  assert.match(source, /announcement\.parentElement !== app/);
  assert.match(source, /announcement\.previousElementSibling !== calendar/);
  assert.match(source, /calendar\.after\(announcement\)/);
  assert.doesNotMatch(source, /calendarSettings\.after\(announcement\)/);
});

test('layout repair observer stops after announcement and reaction panels are placed', async () => {
  const source = await readFile(layoutPath, 'utf8');
  assert.match(source, /return Boolean\(announcement && reaction\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /observer\.observe\(app, \{ childList: true, subtree: true \}\)/);
});
