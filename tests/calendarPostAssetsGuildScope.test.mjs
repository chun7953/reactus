import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assetPath = new URL('../src/lib/calendarPostAssets.js', import.meta.url);
const databasePath = new URL('../src/db/database.js', import.meta.url);
const taskMonitorPath = new URL('../src/lib/taskMonitor.js', import.meta.url);
const webCreatePath = new URL('../src/lib/webCalendarAdminCore.js', import.meta.url);
const duplicatePath = new URL('../src/lib/webCalendarDuplicateService.js', import.meta.url);
const webEditPath = new URL('../src/lib/webCalendarEditService.js', import.meta.url);
const slashCreatePath = new URL('../src/commands/calendar/calendarpost.js', import.meta.url);
const slashEditPath = new URL('../src/commands/calendar/calendaredit.js', import.meta.url);
const callerPaths = [webCreatePath, duplicatePath, webEditPath, slashCreatePath, slashEditPath];

test('calendar image reads and deletes are scoped by guild', async () => {
  const source = await readFile(assetPath, 'utf8');
  assert.match(source, /getCalendarPostImage\(assetId, guildId\)/);
  assert.match(source, /WHERE id = \$1 AND guild_id = \$2/);
  assert.match(source, /deleteCalendarPostImage\(assetId, guildId\)/);
  assert.match(source, /DELETE FROM calendar_post_assets WHERE id = \$1 AND guild_id = \$2/);
  assert.match(source, /getCalendarPostImage\(assetId, scopedGuildId\)/);
});

test('calendar asset ownership is nullable, guild-scoped, and verification-stamped', async () => {
  const [assetSource, databaseSource] = await Promise.all([
    readFile(assetPath, 'utf8'),
    readFile(databasePath, 'utf8'),
  ]);

  assert.match(databaseSource, /ALTER TABLE calendar_post_assets ADD COLUMN IF NOT EXISTS calendar_id TEXT/);
  assert.match(databaseSource, /ALTER TABLE calendar_post_assets ADD COLUMN IF NOT EXISTS event_id TEXT/);
  assert.match(databaseSource, /ALTER TABLE calendar_post_assets ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE/);
  assert.match(databaseSource, /calendar_post_assets_owner_idx/);

  assert.match(assetSource, /bindCalendarPostImageOwner\(assetId, guildId/);
  assert.match(assetSource, /SET calendar_id = \$3,/);
  assert.match(assetSource, /event_id = \$4,/);
  assert.match(assetSource, /last_verified_at = CURRENT_TIMESTAMP/);
  assert.match(assetSource, /WHERE id = \$1 AND guild_id = \$2/);
  assert.match(assetSource, /予定所有情報を保存できませんでした/);
  assert.match(assetSource, /catch \(error\)[\s\S]*return false;/);
});

test('all asset-producing calendar writes bind ownership after Google succeeds', async () => {
  const [webCreate, duplicate, webEdit, slashCreate, slashEdit] = await Promise.all([
    readFile(webCreatePath, 'utf8'),
    readFile(duplicatePath, 'utf8'),
    readFile(webEditPath, 'utf8'),
    readFile(slashCreatePath, 'utf8'),
    readFile(slashEditPath, 'utf8'),
  ]);

  assert.equal((webCreate.match(/bindCalendarPostImageOwner\(assetId, guildId/g) || []).length, 2);
  assert.equal((duplicate.match(/bindCalendarPostImageOwner\(clonedAssetId, guildId/g) || []).length, 1);
  assert.equal((webEdit.match(/bindCalendarPostImageOwner\(newAssetId, guildId/g) || []).length, 1);
  assert.equal((webEdit.match(/bindCalendarPostImageOwner\(activeAssetId, guildId/g) || []).length, 1);
  assert.equal((slashCreate.match(/bindCalendarPostImageOwner\(assetId, interaction\.guildId/g) || []).length, 1);
  assert.equal((slashEdit.match(/bindCalendarPostImageOwner\(activeAssetId, interaction\.guildId/g) || []).length, 2);

  assert.ok(webCreate.indexOf('const event = await insertEvent') < webCreate.indexOf('bindCalendarPostImageOwner(assetId, guildId'));
  assert.ok(duplicate.indexOf('const response = await calendar.events.insert') < duplicate.indexOf('bindCalendarPostImageOwner(clonedAssetId, guildId'));
  assert.ok(webEdit.indexOf('const created = (await resolved.calendar.events.insert') < webEdit.indexOf('bindCalendarPostImageOwner(newAssetId, guildId'));
  assert.ok(slashCreate.indexOf('const event = await insertCalendarEvent') < slashCreate.indexOf('bindCalendarPostImageOwner(assetId, interaction.guildId'));
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
