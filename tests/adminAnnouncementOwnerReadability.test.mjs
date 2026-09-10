import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const announcementsPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);

test('announcement owner renders Discord channel links by channel name without a repair observer', async () => {
  const [source, entrySource] = await Promise.all([
    readFile(announcementsPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  assert.ok(source.includes('/<#(\\d{15,22})>/g'));
  assert.match(source, /announcement-channel-preview/);
  assert.match(source, /appendPreviewText\(text, item\.message \|\| ''\);/);
  assert.doesNotMatch(source, /new MutationObserver/);
  assert.doesNotMatch(entrySource, /admin-announcement-readability\.js/);
});
