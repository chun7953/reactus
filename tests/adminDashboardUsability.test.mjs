import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const dashboardPath = new URL('../public/common/admin-dashboard-usability.js', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);

test('dashboard pagination does not start a second calendar data request', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  assert.doesNotMatch(source, /\/api\/admin\/events/);
  assert.doesNotMatch(source, /refreshCalendar/);
});

test('upcoming events are initially capped and can be progressively expanded', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  assert.match(source, /const PAGE_SIZE = 12/);
  assert.match(source, /index < upcomingLimit/);
  assert.match(source, /さらに\$\{Math\.min\(PAGE_SIZE, cards\.length - shown\)\}件表示/);
  assert.match(source, /最初の12件に戻す/);
});

test('event list owner notifies pagination explicitly instead of being observed', async () => {
  const [adminSource, dashboardSource] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(dashboardPath, 'utf8'),
  ]);
  assert.match(adminSource, /reactus:event-list-rendered/);
  assert.match(dashboardSource, /addEventListener\('reactus:event-list-rendered', scheduleUpcomingUpdate\)/);
  assert.doesNotMatch(dashboardSource, /new MutationObserver/);
  assert.doesNotMatch(dashboardSource, /upcomingObserver/);
});

test('dashboard usability module is loaded by the admin module bundle', async () => {
  const source = await readFile(enhancementModulesPath, 'utf8');
  assert.match(source, /import '\.\/admin-dashboard-usability\.js';/);
});
