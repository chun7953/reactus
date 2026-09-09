import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fallbackPath = new URL('../public/common/admin-bootstrap-fallback.js', import.meta.url);
const cacheEntryPath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('admin reveals a standalone calendar instead of leaving a loading-only screen when bootstrap stalls', async () => {
  const source = await readFile(fallbackPath, 'utf8');
  assert.match(source, /DEGRADED_STARTUP_MS = 9_000/);
  assert.match(source, /identity\.includes\(' · '\)/);
  assert.match(source, /ensureCalendarOverview\(app\)/);
  assert.match(source, /app\.classList\.remove\('hidden'\)/);
  assert.match(source, /child\.id === 'calendarOverview'/);
  assert.match(source, /月カレンダーは設定画面と切り離して読み込みます/);
  assert.match(source, /管理画面を読み込んでいます/);
  assert.match(source, /reactusDegradedRetry/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test('first admin module directly loads the fallback and focused month calendar', async () => {
  const source = await readFile(cacheEntryPath, 'utf8');
  assert.match(source, /^import '\.\/admin-bootstrap-fallback\.js';/m);
  assert.match(source, /^import '\.\/admin-calendar-month-view\.js';/m);
});

test('future-scope entry still orders startup protection before optional admin modules', async () => {
  const source = await readFile(entryPath, 'utf8');
  const startup = source.indexOf("import './admin-startup-resilience.js';");
  const fallback = source.indexOf("import './admin-bootstrap-fallback.js';");
  const month = source.indexOf("import './admin-calendar-month-view.js';");
  const settings = source.indexOf("import './admin-calendar-settings.js';");
  assert.ok(startup >= 0 && fallback > startup && month > fallback && settings > month);
});
