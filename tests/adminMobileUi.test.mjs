import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mobilePath = new URL('../public/common/admin-mobile.js', import.meta.url);
const mobileDayInlinePath = new URL('../public/common/admin-mobile-day-inline.js', import.meta.url);
const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const legacyHotfixPath = new URL('../public/common/admin-mobile-layout-hotfix.js', import.meta.url);

test('mobile admin module is loaded from the dashboard entry chain without a post-hoc layout hotfix', async () => {
  const entry = await readFile(entryPath, 'utf8');
  assert.match(entry, /admin-mobile\.js/);
  assert.doesNotMatch(entry, /admin-mobile-layout-hotfix\.js/);
  await assert.rejects(readFile(legacyHotfixPath, 'utf8'), error => error?.code === 'ENOENT');
});

test('mobile admin keeps a compact seven-column month calendar while core owns tap day counts', async () => {
  const [mobileSource, inlineSource] = await Promise.all([
    readFile(mobilePath, 'utf8'),
    readFile(mobileDayInlinePath, 'utf8'),
  ]);

  assert.match(mobileSource, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(mobileSource, /reactus-mobile-event-count/);
  assert.doesNotMatch(mobileSource, /openCompactDay/);
  assert.doesNotMatch(mobileSource, /addEventListener\('reactus:month-rendered'/);
  assert.doesNotMatch(mobileSource, /new MutationObserver\(/);

  assert.match(inlineSource, /reactus-mobile-event-count/);
  assert.match(inlineSource, /getMonthEventsForDay\(key\)\.length/);
  assert.match(inlineSource, /badge\.addEventListener\('click'/);
  assert.match(inlineSource, /addEventListener\('reactus:month-rendered', handleMonthRendered\)/);
  assert.doesNotMatch(inlineSource, /document\.addEventListener\('click'/);
  assert.doesNotMatch(inlineSource, /stopImmediatePropagation/);
  assert.doesNotMatch(inlineSource, /new MutationObserver\(/);
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
