import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readabilityPath = new URL('../public/common/admin-announcement-readability.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('sticky announcement list renders Discord channel links by channel name', async () => {
  const [source, entrySource] = await Promise.all([
    readFile(readabilityPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);
  assert.match(source, /#announcementLinkChannel option/);
  assert.ok(source.includes('/<#(\\d{15,22})>/g'));
  assert.match(source, /announcement-channel-preview/);
  assert.match(source, /replaceChildren\(\)/);
  assert.match(entrySource, /admin-announcement-readability\.js/);
});
