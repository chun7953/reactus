import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const controlsPath = new URL('../public/common/admin-event-list-controls.js', import.meta.url);
const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const retiredDashboardPath = new URL('../public/common/admin-dashboard-usability.js', import.meta.url);

test('upcoming event controls never start a second calendar data request', async () => {
  const source = await readFile(controlsPath, 'utf8');
  assert.doesNotMatch(source, /\/api\/admin\/events/);
  assert.doesNotMatch(source, /refreshCalendar/);
});

test('upcoming event controls own search and progressive 12-item display together', async () => {
  const source = await readFile(controlsPath, 'utf8');
  assert.match(source, /const PAGE_SIZE = 12/);
  assert.match(source, /function ensureEventSearch\(/);
  assert.match(source, /search\.addEventListener\('input', applyEventListControls\)/);
  assert.match(source, /index < upcomingLimit/);
  assert.match(source, /さらに\$\{Math\.min\(PAGE_SIZE, cards\.length - shown\)\}件表示/);
  assert.match(source, /最初の12件に戻す/);
});

test('event list owner notifies one explicit controls consumer instead of DOM observation', async () => {
  const [adminSource, controlsSource] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(controlsPath, 'utf8'),
  ]);
  assert.match(adminSource, /reactus:event-list-rendered/);
  assert.match(controlsSource, /addEventListener\('reactus:event-list-rendered', scheduleEventListControlsUpdate\)/);
  assert.doesNotMatch(controlsSource, /new MutationObserver/);
  assert.doesNotMatch(controlsSource, /upcomingObserver/);
});

test('reaction tools no longer own upcoming-event search', async () => {
  const source = await readFile(toolsPath, 'utf8');
  assert.doesNotMatch(source, /eventSearch/);
  assert.doesNotMatch(source, /addSearchBox/);
  assert.doesNotMatch(source, /calendar-search/);
});

test('canonical event-list controls are loaded and retired dashboard helper stays absent', async () => {
  const source = await readFile(enhancementModulesPath, 'utf8');
  assert.match(source, /import '\.\/admin-event-list-controls\.js';/);
  assert.doesNotMatch(source, /admin-dashboard-usability\.js/);
  await assert.rejects(readFile(retiredDashboardPath, 'utf8'), error => error?.code === 'ENOENT');
});
