import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const taskMonitorPath = new URL('../src/lib/taskMonitor.js', import.meta.url);

test('high-frequency giveaway loop reads running giveaways once per cycle', async () => {
  const source = await readFile(taskMonitorPath, 'utf8');
  const occurrences = source.match(/get\.allActiveGiveaways\(\)/g) || [];
  assert.equal(occurrences.length, 1);
  assert.match(source, /const activeGiveaways = await get\.allActiveGiveaways\(\);/);
  assert.match(source, /await checkFinishedGiveaways\(client, activeGiveaways, now\);/);
  assert.match(source, /const remainingGiveaways = activeGiveaways\.filter\(g => new Date\(g\.end_time\) > now\);/);
  assert.match(source, /await validateActiveGiveaways\(client, remainingGiveaways\);/);
});
