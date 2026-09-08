import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const eventPath = new URL('../src/events/messageCreate.js', import.meta.url);

test('sticky announcement refreshes are serialized per guild channel', async () => {
  const source = await readFile(eventPath, 'utf8');
  assert.match(source, /const announcementQueues = new Map\(\)/);
  assert.match(source, /const key = `\$\{message\.guild\.id\}:\$\{message\.channel\.id\}`/);
  assert.match(source, /announcementQueues\.get\(key\) \|\| Promise\.resolve\(\)/);
  assert.match(source, /\.then\(\(\) => handleAutoAnnounce\(message\)\)/);
  assert.match(source, /announcementQueues\.delete\(key\)/);
  assert.match(source, /enqueueAutoAnnounce\(message\)/);
});
