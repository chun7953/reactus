import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const commandPath = new URL('../src/commands/utility/listsettings.js', import.meta.url);

test('listsettings includes sticky channel announcements without dumping long bodies', async () => {
  const source = await readFile(commandPath, 'utf8');
  assert.match(source, /SELECT channel_id FROM announcements WHERE guild_id = \$1/);
  assert.match(source, /\*\*チャンネル下部の案内\*\*/);
  assert.match(source, /内容の確認・編集は/);
  assert.match(source, /\/reactus/);
  assert.doesNotMatch(source, /SELECT channel_id, message FROM announcements/);
});

test('listsettings uses beginner-friendly names for existing automation settings', async () => {
  const source = await readFile(commandPath, 'utf8');
  assert.match(source, /反応する言葉/);
  assert.match(source, /カレンダーからの自動投稿/);
  assert.match(source, /予定を見分ける合図/);
  assert.match(source, /現在の自動設定（投稿、リアクション、チャンネル案内）/);
});
