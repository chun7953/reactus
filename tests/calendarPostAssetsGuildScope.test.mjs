import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assetPath = new URL('../src/lib/calendarPostAssets.js', import.meta.url);
const taskMonitorPath = new URL('../src/lib/taskMonitor.js', import.meta.url);
const callerPaths = [
  new URL('../src/lib/webCalendarAdminCore.js', import.meta.url),
  new URL('../src/lib/webCalendarDuplicateService.js', import.meta.url),
  new URL('../src/lib/webCalendarEditService.js', import.meta.url),
  new URL('../src/commands/calendar/calendarpost.js', import.meta.url),
  new URL('../src/commands/calendar/calendaredit.js', import.meta.url),
];

test('calendar image reads and deletes are scoped by guild', async () => {
  const source = await readFile(assetPath, 'utf8');
  assert.match(source, /getCalendarPostImage\(assetId, guildId\)/);
  assert.match(source, /WHERE id = \$1 AND guild_id = \$2/);
  assert.match(source, /deleteCalendarPostImage\(assetId, guildId\)/);
  assert.match(source, /DELETE FROM calendar_post_assets WHERE id = \$1 AND guild_id = \$2/);
  assert.match(source, /getCalendarPostImage\(assetId, scopedGuildId\)/);
});

test('calendar notification image lookup uses its monitor guild', async () => {
  const source = await readFile(taskMonitorPath, 'utf8');
  assert.match(source, /eventImageFile\(properties, guildId\)/);
  assert.match(source, /getCalendarPostImage\(assetId, guildId\)/);
  assert.equal((source.match(/eventImageFile\(privateProperties, monitor\.guild_id\)/g) || []).length, 2);
});

test('calendar management callers provide guild scope when deleting assets', async () => {
  const sources = await Promise.all(callerPaths.map(path => readFile(path, 'utf8')));
  const combined = sources.join('\n');
  assert.match(combined, /deleteCalendarPostImage\(assetId, guildId\)/);
  assert.match(combined, /deleteCalendarPostImage\(clonedAssetId, guildId\)/);
  assert.match(combined, /deleteCalendarPostImage\(newAssetId, guildId\)/);
  assert.match(combined, /deleteCalendarPostImage\(oldAssetId, guildId\)/);
  assert.match(combined, /deleteCalendarPostImage\(assetId, interaction\.guildId\)/);
  assert.match(combined, /deleteCalendarPostImage\(image\.oldAssetId, interaction\.guildId\)/);
  assert.match(combined, /deleteCalendarPostImage\(createdAssetId, interaction\.guildId\)/);
  assert.doesNotMatch(combined, /deleteCalendarPostImage\([^,\n)]+\)\.catch/);
});
