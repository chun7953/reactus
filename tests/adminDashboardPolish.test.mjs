import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const guidePath = new URL('../public/common/admin-beginner-guide.js', import.meta.url);
const adminPath = new URL('../public/admin.js', import.meta.url);
const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const calendarSettingsPath = new URL('../public/common/admin-calendar-settings.js', import.meta.url);
const settingsPath = new URL('../public/common/admin-calendar-settings-usability.js', import.meta.url);
const navigationPath = new URL('../public/common/admin-navigation-polish.js', import.meta.url);
const announcementsPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const retiredPermissionsPath = new URL('../public/common/admin-manageable-targets.js', import.meta.url);
const retiredLabelsPath = new URL('../public/common/admin-monitor-labels.js', import.meta.url);
const retiredDestinationsPath = new URL('../public/common/admin-post-destinations.js', import.meta.url);

test('admin entry loads only active second-round usability helpers', async () => {
  const source = await readFile(entryPath, 'utf8');
  assert.match(source, /admin-calendar-settings-usability\.js/);
  assert.match(source, /admin-navigation-polish\.js/);
  assert.doesNotMatch(source, /admin-manageable-targets\.js/);
  assert.doesNotMatch(source, /admin-monitor-labels\.js/);
  assert.doesNotMatch(source, /admin-post-destinations\.js/);
  assert.doesNotMatch(source, /admin-panel-layout\.js/);
  for (const path of [retiredPermissionsPath, retiredLabelsPath, retiredDestinationsPath]) {
    await assert.rejects(readFile(path, 'utf8'), error => error?.code === 'ENOENT');
  }
});

test('beginner guide keeps calendar first and does not duplicate folded connection settings', async () => {
  const source = await readFile(guidePath, 'utf8');
  const calendar = source.indexOf("title: 'カレンダーを見る'");
  const schedule = source.indexOf("title: '予定・抽選を作る'");
  assert.ok(calendar >= 0 && schedule > calendar);
  assert.doesNotMatch(source, /title: 'Googleカレンダー・投稿先を設定する'/);
});

test('reaction owner renders manageable channels and read-only rules without a repair pass', async () => {
  const tools = await readFile(toolsPath, 'utf8');
  assert.match(tools, /filter\(channel => channel\.canManage === true\)/);
  assert.match(tools, /channel\?\.canManage === true/);
  assert.match(tools, /reactus-readonly-badge/);
  assert.match(tools, /閲覧のみ/);
});

test('schedule editor owns destination permissions, labels, hydration and refresh', async () => {
  const source = await readFile(adminPath, 'utf8');
  assert.match(source, /DESTINATION_TTL_MS = 15_000/);
  assert.match(source, /monitor\.canManage !== true/);
  assert.match(source, /function monitorLabel\(/);
  assert.match(source, /duplicateChannelIds/);
  assert.match(source, /channels=\$\{encodeURIComponent\(mode\)\}/);
  assert.match(source, /const mode = force \? 'refresh' : '1'/);
  assert.match(source, /refreshMonitorOptions\(\{ silent: true \}\)/);
  assert.match(source, /#monitor'\)\.addEventListener\('focus'/);
  assert.match(source, /reactus:edit-event/);
  assert.match(source, /抽選用の投稿先がありません/);
  assert.match(source, /通常投稿用の投稿先がありません/);
});

test('calendar settings owner renders permissions and final wording while pagination follows its lifecycle', async () => {
  const [owner, usability] = await Promise.all([
    readFile(calendarSettingsPath, 'utf8'),
    readFile(settingsPath, 'utf8'),
  ]);
  assert.match(owner, /filter\(item => item\.canManage === true\)/);
  assert.match(owner, /monitor\.canManage !== true/);
  assert.match(owner, /reactus-readonly-badge/);
  assert.match(owner, /friendlyMonitorType/);
  assert.match(owner, /'抽選' : '通常投稿'/);
  assert.match(owner, /Googleカレンダーから直接作る予定の合図/);
  assert.match(owner, /new CustomEvent\('reactus:calendar-settings-rendered'/);
  assert.match(usability, /CALENDAR_SETTINGS_PAGE_SIZE = 8/);
  assert.match(usability, /投稿先・カレンダーで検索/);
  assert.match(usability, /addEventListener\('reactus:calendar-settings-rendered'/);
  assert.doesNotMatch(usability, /new MutationObserver\(/);
  assert.doesNotMatch(usability, /\/api\/admin\/bootstrap/);
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
