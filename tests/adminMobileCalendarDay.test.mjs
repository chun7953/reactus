import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inlinePath = new URL('../public/common/admin-mobile-day-inline.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('mobile calendar day badge uses inline details instead of opening a modal dialog', async () => {
  const [source, entry] = await Promise.all([
    readFile(inlinePath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  assert.match(entry, /admin-mobile-day-inline\.js/);
  assert.match(source, /reactusMobileDayInline/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /openInlineDay\(cell\)/);
  assert.match(source, /grid\.after\(panel\)/);
  assert.doesNotMatch(source, /showModal\(/);
  assert.doesNotMatch(source, /document\.createElement\(['"]dialog['"]\)/);
});

test('inline day details fetch all events for the selected day so 6+ events are not truncated', async () => {
  const source = await readFile(inlinePath, 'utf8');
  assert.match(source, /\/api\/admin\/events\?days=90&pastDays=45/);
  assert.match(source, /filter\(item => dateKeyJst\(item\.start\) === key\)/);
  assert.match(source, /for \(const item of events\) appendPayloadEvent\(list, item\)/);
});
