import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);

test('web admin exposes only channels the signed-in moderator can view and manage', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /permissions\?\.has\(PermissionsBitField\.Flags\.ViewChannel\)/);
  assert.match(source, /permissions\?\.has\(PermissionsBitField\.Flags\.ManageMessages\)/);
  assert.match(source, /const allowedChannelIds = manageableChannelIds\(auth\)/);
  assert.match(source, /visibleMonitors = monitors\.filter/);
  assert.match(source, /reactionRules = \(await listWebReactionRules/);
  assert.match(source, /announcements: announcements\.filter/);
  assert.match(source, /events: events\.filter/);
});

test('channel-targeting web admin writes re-check channel access server-side', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /await requireManageableChannel\(auth, payload\?\.channelId\)/);
  assert.match(source, /await requireMonitorAccess\(auth, payload\?\.monitorId\)/);
  assert.match(source, /await requireEventAccess\(auth, payload\)/);
});
