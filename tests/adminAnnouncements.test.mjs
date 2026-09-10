import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const uiPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const startCommandPath = new URL('../src/commands/announce/startannounce.js', import.meta.url);
const stopCommandPath = new URL('../src/commands/announce/stopannounce.js', import.meta.url);

test('announcement admin is Japanese and supports multiline/channel-link editing', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /チャンネル下部の案内/);
  assert.match(source, /これは何をする機能？/);
  assert.match(source, /maxlength=\"2000\"/);
  assert.match(source, /rows=\"10\"/);
  assert.match(source, /改行・URL・Discordのチャンネルリンク/);
  assert.match(source, /`<#\$\{select\.value\}>`/);
  assert.match(source, /white-space:pre-wrap/);
  assert.match(source, /Discordでの見え方/);
});

test('announcement list is paginated and only manageable channels are offered as new targets', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /const ANNOUNCEMENTS_PER_PAGE = 8/);
  assert.match(source, /announcementPrev/);
  assert.match(source, /announcementNext/);
  assert.match(source, /\$\{announcementState\.page \+ 1\} \/ \$\{pageCount\}ページ/);
  assert.match(source, /if \(channel\.canManage\) addOption\(target/);
  assert.match(source, /自分が見られるチャンネルの案内だけを表示します/);
});

test('admin handler exposes list, save, and delete announcement endpoints', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /pathname === '\/api\/admin\/announcements' && req\.method === 'GET'/);
  assert.match(source, /pathname === '\/api\/admin\/announcements' && req\.method === 'POST'/);
  assert.match(source, /pathname === '\/api\/admin\/announcements\/delete'/);
  assert.match(source, /listWebAnnouncements/);
  assert.match(source, /saveWebAnnouncement/);
  assert.match(source, /deleteWebAnnouncement/);
});

test('announcement slash commands use the same shared service as the web admin', async () => {
  const [startSource, stopSource] = await Promise.all([
    readFile(startCommandPath, 'utf8'),
    readFile(stopCommandPath, 'utf8'),
  ]);
  assert.match(startSource, /saveWebAnnouncement/);
  assert.match(stopSource, /deleteWebAnnouncement/);
  assert.match(stopSource, /表示中の案内も削除/);
});

test('announcement and Japanese UI helpers are loaded by the admin entry chain', async () => {
  const source = await readFile(enhancementModulesPath, 'utf8');
  assert.match(source, /admin-announcements\.js/);
  assert.match(source, /admin-japanese-ui\.js/);
});
