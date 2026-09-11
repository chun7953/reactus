import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { monitorsForActiveGuilds } from '../src/lib/calendarMonitorScope.js';

const taskMonitorPath = new URL('../src/lib/taskMonitor.js', import.meta.url);

test('calendar monitoring keeps only monitors for guilds the bot currently belongs to', () => {
  const client = {
    guilds: {
      cache: new Map([
        ['guild-1', { id: 'guild-1' }],
        ['guild-3', { id: 'guild-3' }],
      ]),
    },
  };
  const monitors = [
    { id: 1, guild_id: 'guild-1' },
    { id: 2, guild_id: 'guild-2' },
    { id: 3, guild_id: 'guild-3' },
    { id: 4, guild_id: null },
  ];

  assert.deepEqual(
    monitorsForActiveGuilds(client, monitors).map(monitor => monitor.id),
    [1, 3],
  );
});

test('calendar monitoring fails closed when the Discord guild cache is unavailable', () => {
  assert.deepEqual(monitorsForActiveGuilds(null, [{ guild_id: 'guild-1' }]), []);
  assert.deepEqual(monitorsForActiveGuilds({ guilds: {} }, [{ guild_id: 'guild-1' }]), []);
});

test('task monitor scopes orphaned guilds before initializing Google Calendar access', async () => {
  const source = await readFile(taskMonitorPath, 'utf8');
  const scopeIndex = source.indexOf('monitorsForActiveGuilds(client, await get.allMonitors())');
  const googleIndex = source.indexOf('await initializeSheetsAPI()');

  assert.notEqual(scopeIndex, -1, 'task monitor must scope calendar monitors to active guilds');
  assert.notEqual(googleIndex, -1, 'task monitor must initialize Google Calendar for active monitors');
  assert.ok(scopeIndex < googleIndex, 'orphan monitor filtering must happen before Google API access');
});
