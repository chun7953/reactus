import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminEntryPath = new URL('../public/admin-entry.js', import.meta.url);
const adminPath = new URL('../public/admin.js', import.meta.url);
const enhancementsEntryPath = new URL('../public/admin-enhancements-entry.js', import.meta.url);
const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const monthViewPath = new URL('../public/common/admin-calendar-month-view.js', import.meta.url);
const calendarEditPath = new URL('../public/common/admin-calendar-edit.js', import.meta.url);
const calendarQuickCreatePath = new URL('../public/common/admin-calendar-quick-create.js', import.meta.url);
const calendarDragPath = new URL('../public/common/admin-calendar-drag.js', import.meta.url);
const mentionsPath = new URL('../public/common/admin-mentions.js', import.meta.url);
const announcementsPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const calendarSettingsPath = new URL('../public/common/admin-calendar-settings.js', import.meta.url);
const calendarSettingsFoldPath = new URL('../public/common/admin-calendar-settings-fold.js', import.meta.url);
const calendarLoadGuardPath = new URL('../public/common/admin-calendar-load-guard.js', import.meta.url);
const mobileLayoutHotfixPath = new URL('../public/common/admin-mobile-layout-hotfix.js', import.meta.url);
const calendarSettingsUsabilityPath = new URL('../public/common/admin-calendar-settings-usability.js', import.meta.url);
const reactionPaginationPath = new URL('../public/common/admin-reaction-pagination.js', import.meta.url);
const mobilePath = new URL('../public/common/admin-mobile.js', import.meta.url);

test('admin enhancements do not replace the browser MutationObserver implementation', async () => {
  const [entry, announcements, futureScope] = await Promise.all([
    readFile(enhancementsEntryPath, 'utf8'),
    readFile(announcementsPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
  ]);

  assert.doesNotMatch(entry, /admin-observer-guard\.js/);
  assert.doesNotMatch(entry, /window\.MutationObserver\s*=/);
  assert.doesNotMatch(announcements, /observe\(document\.documentElement/);
  assert.doesNotMatch(futureScope, /admin-panel-layout\.js/);
});

test('bootstrap helpers rely on owned startup order instead of document-wide observers or external layout guards', async () => {
  const [
    adminEntry,
    enhancementsEntry,
    futureScope,
    monthView,
    calendarEdit,
    calendarQuickCreate,
    calendarDrag,
    calendarSettings,
    fold,
    settingsUsability,
    reactionPagination,
    mobile,
  ] = await Promise.all([
    readFile(adminEntryPath, 'utf8'),
    readFile(enhancementsEntryPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
    readFile(monthViewPath, 'utf8'),
    readFile(calendarEditPath, 'utf8'),
    readFile(calendarQuickCreatePath, 'utf8'),
    readFile(calendarDragPath, 'utf8'),
    readFile(calendarSettingsPath, 'utf8'),
    readFile(calendarSettingsFoldPath, 'utf8'),
    readFile(calendarSettingsUsabilityPath, 'utf8'),
    readFile(reactionPaginationPath, 'utf8'),
    readFile(mobilePath, 'utf8'),
  ]);

  for (const source of [
    monthView,
    calendarSettings,
    fold,
    settingsUsability,
    reactionPagination,
    mobile,
  ]) {
    assert.doesNotMatch(source, /observe\(document\.documentElement/);
  }

  assert.ok(adminEntry.indexOf("./common/admin-calendar-shell.js") < adminEntry.indexOf("./common/admin-calendar-month-view.js"));
  assert.doesNotMatch(adminEntry, /admin-calendar-load-guard\.js/);
  await assert.rejects(readFile(calendarLoadGuardPath, 'utf8'), error => error?.code === 'ENOENT');
  assert.ok(enhancementsEntry.indexOf("./common/admin-tools.js") < enhancementsEntry.indexOf("./common/admin-future-scope.js"));
  assert.ok(futureScope.indexOf("./admin-calendar-settings.js") < futureScope.indexOf("./admin-calendar-settings-fold.js"));
  assert.ok(futureScope.indexOf("./admin-calendar-settings.js") < futureScope.indexOf("./admin-calendar-settings-usability.js"));
  assert.ok(futureScope.indexOf("./admin-calendar-settings.js") < futureScope.indexOf("./admin-mobile.js"));
  assert.doesNotMatch(futureScope, /admin-mobile-layout-hotfix\.js/);
  await assert.rejects(readFile(mobileLayoutHotfixPath, 'utf8'), error => error?.code === 'ENOENT');

  assert.match(monthView, /MONTH_REQUEST_TIMEOUT_MS = 40_000/);
  assert.match(monthView, /new AbortController\(\)/);
  assert.match(monthView, /signal: controller\.signal/);
  assert.match(monthView, /reactus-month-retry/);
  assert.match(monthView, /new CustomEvent\('reactus:month-rendered'/);
  for (const source of [monthView, calendarEdit, calendarQuickCreate, calendarDrag, mobile]) {
    assert.doesNotMatch(source, /new MutationObserver\(/);
  }
  for (const source of [calendarEdit, calendarQuickCreate, calendarDrag, mobile]) {
    assert.match(source, /addEventListener\('reactus:month-rendered'/);
  }
  assert.doesNotMatch(settingsUsability, /new MutationObserver\(/);
  assert.match(settingsUsability, /addEventListener\('reactus:calendar-settings-rendered'/);
  assert.doesNotMatch(reactionPagination, /new MutationObserver\(/);
  assert.match(reactionPagination, /addEventListener\('reactus:reaction-rules-rendered'/);
  assert.doesNotMatch(mobile, /appObserver/);
  assert.doesNotMatch(mobile, /observe\(app,/);
  assert.doesNotMatch(mobile, /reactusMobileNav/);
  assert.match(mobile, /#calendarSettingsMount\{width:100%;min-width:0\}/);
  assert.match(calendarSettings, /void initializeCalendarSettings\(\);/);
});

test('rich mentions are owned by the core schedule data flow without a fetch wrapper', async () => {
  const [admin, mentions, futureScope] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(mentionsPath, 'utf8'),
    readFile(futureScopePath, 'utf8'),
  ]);

  assert.match(admin, /import \{ loadMentionConfig, mentionPayload \} from '\.\/common\/admin-mentions\.js';/);
  assert.match(admin, /mention:\s*mentionPayload\(\)/);
  assert.match(admin, /loadMentionConfig\(detail\.mention\)/);
  assert.doesNotMatch(mentions, /window\.fetch\s*=/);
  assert.doesNotMatch(mentions, /originalFetch/);
  assert.doesNotMatch(mentions, /observe\(document\.documentElement/);
  assert.doesNotMatch(mentions, /window\.ReactusMentions/);
  assert.doesNotMatch(futureScope, /admin-mentions\.js/);
});

test('the month calendar has one renderer and admin tools no longer replace its DOM', async () => {
  const [tools, monthView] = await Promise.all([
    readFile(toolsPath, 'utf8'),
    readFile(monthViewPath, 'utf8'),
  ]);

  assert.doesNotMatch(tools, /function renderMonth\(/);
  assert.doesNotMatch(tools, /function loadCalendarEvents\(/);
  assert.doesNotMatch(tools, /\/api\/admin\/events\?days=365/);
  assert.match(tools, /month calendar is owned exclusively by admin-calendar-month-view\.js/);
  assert.match(monthView, /function renderOwnedMonth\(/);
});

test('duplicate calendar hover layer is not loaded in the enhancement bundle', async () => {
  const entry = await readFile(enhancementsEntryPath, 'utf8');
  assert.doesNotMatch(entry, /admin-calendar-polish\.js/);
});
