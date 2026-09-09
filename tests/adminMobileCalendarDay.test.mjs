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

test('inline day details include every event overlapping the selected JST day', async () => {
  const source = await readFile(inlinePath, 'utf8');
  assert.match(source, /\/api\/admin\/events\?days=90&pastDays=45/);
  assert.match(source, /function eventOverlapsJstDay\(item, key\)/);
  assert.match(source, /start < dayEnd && end > dayStart/);
  assert.match(source, /filter\(item => eventOverlapsJstDay\(item, key\)\)/);
  assert.match(source, /for \(const item of events\) appendPayloadEvent\(list, item, key\)/);
});

test('inline day cards show useful details even when a legacy trigger-only title becomes empty', async () => {
  const source = await readFile(inlinePath, 'utf8');
  assert.match(source, /function cleanEventTitle\(item\)/);
  assert.match(source, /item\?\.type === 'giveaway' \? '抽選' : '予定'/);
  assert.match(source, /reactus-mobile-day-inline-meta/);
  assert.match(source, /reactus-mobile-day-inline-body/);
  assert.match(source, /parseGiveaway/);
  assert.match(source, /前日から継続/);
});
