import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const announcementsPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);

test('announcement panel is mounted directly as a top-level calendar sibling', async () => {
  const source = await readFile(announcementsPath, 'utf8');
  assert.match(source, /const calendar = aq\('#calendarOverview'\)/);
  assert.match(source, /calendar && calendar\.parentElement === app/);
  assert.match(source, /calendar\.after\(panel\)/);
  assert.doesNotMatch(source, /calendarSettings\.after\(panel\)/);
});

test('announcement placement no longer depends on a post-hoc layout repair observer', async () => {
  const [announcements, futureScope] = await Promise.all([
    readFile(announcementsPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
  ]);
  assert.doesNotMatch(announcements, /observe\(document\.documentElement/);
  assert.doesNotMatch(futureScope, /admin-panel-layout\.js/);
});
