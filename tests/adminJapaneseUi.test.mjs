import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const uiPath = new URL('../public/common/admin-japanese-ui.js', import.meta.url);

test('web admin replaces English section labels with Japanese', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /\['NEW SCHEDULE', '新しい予定'\]/);
  assert.match(source, /\['CALENDAR', '月カレンダー'\]/);
  assert.match(source, /\['REACTIONS', '自動リアクション'\]/);
  assert.match(source, /\['HISTORY', '予定の履歴'\]/);
});

test('web admin explains technical calendar settings in beginner-friendly words', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /予定を見分ける合図（キーワード）/);
  assert.match(source, /投稿先とカレンダーの設定/);
  assert.match(source, /Googleカレンダー・投稿先の設定を開く/);
  assert.match(source, /普段使う機能を、Discordのコマンドを覚えなくても設定できます/);
  assert.match(source, /Reactus 管理画面/);
});
