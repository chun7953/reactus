import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fallbackPath = new URL('../public/common/admin-bootstrap-fallback.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('admin reveals the calendar instead of leaving a logout-only blank screen when bootstrap stalls', async () => {
  const source = await readFile(fallbackPath, 'utf8');
  assert.match(source, /DEGRADED_STARTUP_MS = 11_000/);
  assert.match(source, /app\.classList\.remove\('hidden'\)/);
  assert.match(source, /child\.id === 'calendarOverview'/);
  assert.match(source, /月カレンダーだけ個別に読み込みます/);
  assert.match(source, /reactusDegradedRetry/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test('startup protection and month calendar load before optional admin modules', async () => {
  const source = await readFile(entryPath, 'utf8');
  const startup = source.indexOf("import './admin-startup-resilience.js';");
  const fallback = source.indexOf("import './admin-bootstrap-fallback.js';");
  const month = source.indexOf("import './admin-calendar-month-view.js';");
  const settings = source.indexOf("import './admin-calendar-settings.js';");
  assert.ok(startup >= 0 && fallback > startup && month > fallback && settings > month);
});
