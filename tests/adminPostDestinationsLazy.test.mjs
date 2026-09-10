import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const retiredModulePath = new URL('../public/common/admin-post-destinations.js', import.meta.url);

test('schedule editor owns post destinations instead of a deferred helper', async () => {
  const [source, entry] = await Promise.all([
    readFile(adminPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  assert.doesNotMatch(entry, /admin-post-destinations\.js/);
  await assert.rejects(readFile(retiredModulePath, 'utf8'), error => error?.code === 'ENOENT');
  assert.match(source, /DESTINATION_TTL_MS = 15_000/);
  assert.match(source, /refreshMonitorOptions/);
  assert.match(source, /channels=\$\{encodeURIComponent\(mode\)\}/);
  assert.match(source, /const mode = force \? 'refresh' : '1'/);
  assert.match(source, /addEventListener\('focus'/);
  assert.match(source, /addEventListener\('change'/);
  assert.match(source, /reactus:edit-event/);
  assert.match(source, /^\$\$\('\.segment'\)\.forEach/m);
  assert.doesNotMatch(source, /^\$\('\.segment'\)\.forEach/m);
  assert.doesNotMatch(source, /new MutationObserver/);
});

test('core destination renderer is permission-aware and disambiguates duplicate channels', async () => {
  const source = await readFile(adminPath, 'utf8');
  assert.match(source, /monitor\.canManage !== true/);
  assert.match(source, /function monitorLabel\(/);
  assert.match(source, /duplicateChannelIds/);
  assert.match(source, /calendarName \|\| monitor\.calendarId/);
  assert.match(source, /抽選用の投稿先がありません/);
  assert.match(source, /通常投稿用の投稿先がありません/);
});
