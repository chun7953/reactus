import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mobilePath = new URL('../public/common/admin-mobile.js', import.meta.url);
const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const legacyHotfixPath = new URL('../public/common/admin-mobile-layout-hotfix.js', import.meta.url);

test('mobile admin module is loaded from the dashboard entry chain without a post-hoc layout hotfix', async () => {
  const entry = await readFile(entryPath, 'utf8');
  assert.match(entry, /admin-mobile\.js/);
  assert.doesNotMatch(entry, /admin-mobile-layout-hotfix\.js/);
  await assert.rejects(readFile(legacyHotfixPath, 'utf8'), error => error?.code === 'ENOENT');
});

test('mobile admin keeps a compact seven-column month calendar with tap day counts', async () => {
  const source = await readFile(mobilePath, 'utf8');
  assert.match(source, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
  assert.match(source, /reactus-mobile-event-count/);
  assert.match(source, /currentMore\.click\(\)/);
  assert.match(source, /openCompactDay\(cell, currentEvents\)/);
  assert.match(source, /addEventListener\('reactus:month-rendered', enhanceCalendarForMobile\)/);
  assert.doesNotMatch(source, /new MutationObserver\(/);
});

test('mobile admin keeps compact forms and canonical layout without the retired fixed navigation', async () => {
  const source = await readFile(mobilePath, 'utf8');
  assert.doesNotMatch(source, /reactusMobileNav/);
  assert.doesNotMatch(source, /installMobileNav/);
  assert.doesNotMatch(source, /appObserver/);
  assert.match(source, /body\{padding-bottom:env\(safe-area-inset-bottom\)\}/);
  assert.match(source, /#calendarSettingsMount\{width:100%;min-width:0\}/);
  assert.match(source, /min-height:46px/);
  assert.match(source, /font-size:16px/);
  assert.match(source, /details\.recurrence/);
  assert.match(source, /details\.open = false/);
});
