import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inlinePath = new URL('../public/common/admin-mobile-day-inline.js', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const monthPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);

test('mobile calendar day badge uses inline details owned by the core calendar runtime', async () => {
  const [source, entry, futureScope] = await Promise.all([
    readFile(inlinePath, 'utf8'),
    readFile(entryPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
  ]);

  assert.match(
    entry,
    /admin-calendar-month-view\.js';\s*import '\.\/common\/admin-mobile-day-inline\.js';/s,
  );
  assert.doesNotMatch(futureScope, /admin-mobile-day-inline\.js/);
  assert.match(source, /reactusMobileDayInline/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /openInlineDay\(cell\)/);
  assert.match(source, /grid\.after\(panel\)/);
  assert.doesNotMatch(source, /showModal\(/);
  assert.doesNotMatch(source, /document\.createElement\(['"]dialog['"]\)/);
});

test('inline day details reuse the complete month-owned event collection without another list request', async () => {
  const [source, monthSource] = await Promise.all([
    readFile(inlinePath, 'utf8'),
    readFile(monthPath, 'utf8'),
  ]);

  assert.match(source, /import \{ getMonthEventsForDay \} from '\.\/admin-calendar-month-view\.js'/);
  assert.match(source, /cell\.dataset\.reactusDate/);
  assert.match(source, /getMonthEventsForDay\(key\)/);
  assert.doesNotMatch(source, /\/api\/admin\/events/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /eventOverlapsJstDay/);
  assert.doesNotMatch(source, /appendRenderedFallback/);

  assert.match(monthSource, /export function getMonthEventsForDay\(key\)/);
  assert.match(monthSource, /monthState\.events\.filter\(event => eventOverlapsDay\(event, normalized\)\)/);
  assert.match(monthSource, /const events = getMonthEventsForDay\(key\)/);
});

test('inline day cards preserve complete useful details from month-owned events', async () => {
  const source = await readFile(inlinePath, 'utf8');
  assert.match(source, /function cleanEventTitle\(item\)/);
  assert.match(source, /item\?\.type === 'giveaway' \? '抽選' : '予定'/);
  assert.match(source, /reactus-mobile-day-inline-meta/);
  assert.match(source, /reactus-mobile-day-inline-body/);
  assert.match(source, /parseGiveaway/);
  assert.match(source, /前日から継続/);
  assert.match(source, /for \(const item of events\) appendPayloadEvent\(list, item, key\)/);
});
