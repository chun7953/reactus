import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const guidePath = new URL('../public/common/admin-japanese-ui.js', import.meta.url);
const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const permissionsPath = new URL('../public/common/admin-manageable-targets.js', import.meta.url);
const settingsPath = new URL('../public/common/admin-calendar-settings-usability.js', import.meta.url);
const navigationPath = new URL('../public/common/admin-navigation-polish.js', import.meta.url);
const announcementsPath = new URL('../public/common/admin-announcements.js', import.meta.url);

test('admin entry loads the second-round usability helpers', async () => {
  const source = await readFile(entryPath, 'utf8');
  assert.match(source, /admin-calendar-settings-usability\.js/);
  assert.match(source, /admin-manageable-targets\.js/);
  assert.match(source, /admin-navigation-polish\.js/);
  assert.doesNotMatch(source, /admin-panel-layout\.js/);
});

test('beginner guide keeps calendar first and does not duplicate folded connection settings', async () => {
  const source = await readFile(guidePath, 'utf8');
  const calendar = source.indexOf("title: 'カレンダーを見る'");
  const schedule = source.indexOf("title: '予定・抽選を作る'");
  assert.ok(calendar >= 0 && schedule > calendar);
  assert.doesNotMatch(source, /title: 'Googleカレンダー・投稿先を設定する'/);
});

test('reaction owner renders manageable channels and read-only rules without a repair pass', async () => {
  const [tools, permissions] = await Promise.all([
    readFile(toolsPath, 'utf8'),
    readFile(permissionsPath, 'utf8'),
  ]);
  assert.match(tools, /filter\(channel => channel\.canManage === true\)/);
  assert.match(tools, /channel\?\.canManage === true/);
  assert.match(tools, /reactus-readonly-badge/);
  assert.match(tools, /閲覧のみ/);
  assert.doesNotMatch(permissions, /#reactionChannel/);
  assert.doesNotMatch(permissions, /#reactionRules/);
  assert.match(permissions, /filter\(channel => channel\.canManage\)/);
  assert.match(permissions, /filter\(monitor => monitor\.canManage\)/);
  assert.match(permissions, /#calendarSettingChannel/);
  assert.match(permissions, /#monitor/);
});

test('calendar connection settings hide routing jargon in the list and paginate long configurations', async () => {
  const source = await readFile(settingsPath, 'utf8');
  assert.match(source, /CALENDAR_SETTINGS_PAGE_SIZE = 8/);
  assert.match(source, /friendlyMonitorType/);
  assert.match(source, /'抽選' : '通常投稿'/);
  assert.match(source, /Googleカレンダーから直接作る予定の合図/);
  assert.match(source, /投稿先・カレンダーで検索/);
});

test('announcement panel owns its top-level placement without a repair pass', async () => {
  const source = await readFile(announcementsPath, 'utf8');
  assert.match(source, /calendar && calendar\.parentElement === app/);
  assert.match(source, /calendar\.after\(panel\)/);
  assert.doesNotMatch(source, /observe\(document\.documentElement/);
});

test('long dashboards provide a back-to-top control', async () => {
  const source = await readFile(navigationPath, 'utf8');
  assert.match(source, /reactusBackToTop/);
  assert.match(source, /window\.scrollY < 700/);
  assert.match(source, /window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
});
