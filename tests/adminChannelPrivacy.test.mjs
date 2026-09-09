import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);

test('web admin hides channels the signed-in moderator cannot view', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /function canViewChannel/);
  assert.match(source, /permissions\?\.has\(PermissionsBitField\.Flags\.ViewChannel\)/);
  assert.match(source, /const visibleIds = visibleChannelIds\(auth\)/);
  assert.match(source, /visibleMonitors = monitors\.filter/);
  assert.match(source, /listWebReactionRules\(auth\.session\.guild_id, auth\.guild\)/);
  assert.match(source, /rawReactionRules[\s\S]*\.filter\(rule => visibleIds\.has\(String\(rule\.channelId\)\)\)/);
  assert.match(source, /announcements: announcements\.filter/);
  assert.match(source, /events: events\.filter/);
});

test('bootstrap hydrates configured monitor channels before applying visibility filters', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /async function hydrateConfiguredChannels/);
  assert.match(source, /!auth\.guild\.channels\.cache\.has\(id\)/);
  assert.match(source, /auth\.guild\.channels\.fetch\(id\)\.catch\(\(\) => null\)/);
  assert.match(source, /await hydrateConfiguredChannels\(auth, monitors\);/);
});

test('bootstrap distinguishes visible channels from channels the moderator can manage', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /function canManageChannel/);
  assert.match(source, /PermissionsBitField\.Flags\.ManageMessages/);
  assert.match(source, /canManage: manageableIds\.has\(String\(channel\.id\)\)/);
  assert.match(source, /canManage: manageableIds\.has\(String\(monitor\.channel_id\)\)/);
});

test('channel-targeting web admin writes re-check manage access server-side', async () => {
  const source = await readFile(handlerPath, 'utf8');
  assert.match(source, /await requireManageableChannel\(auth, payload\?\.channelId\)/);
  assert.match(source, /await requireMonitorAccess\(auth, payload\?\.monitorId\)/);
  assert.match(source, /await requireEventAccess\(auth, payload\)/);
});
