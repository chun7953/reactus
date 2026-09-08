import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardPath = new URL('../public/common/admin-dashboard-usability.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);

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

test('dashboard usability module is loaded by the admin module bundle', async () => {
  const source = await readFile(futureScopePath, 'utf8');
  assert.match(source, /import '\.\/admin-dashboard-usability\.js';/);
});
