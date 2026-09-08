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

test('web admin explains technical settings in beginner-friendly words', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /予定を見分ける合図（キーワード）/);
  assert.match(source, /投稿先とカレンダーの設定/);
  assert.match(source, /Googleカレンダー・投稿先の設定を開く/);
  assert.match(source, /反応する言葉/);
  assert.match(source, /自動で付ける絵文字/);
  assert.match(source, /Reactus 管理画面/);
});

test('web admin offers purpose-based navigation for common tasks', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /何をしたいですか？/);
  assert.match(source, /予定・抽選を作る/);
  assert.match(source, /チャンネル下部に案内を出す/);
  assert.match(source, /月カレンダーを見る/);
  assert.match(source, /自動リアクションを設定する/);
  assert.match(source, /Googleカレンダー・投稿先を設定する/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(source, /Googleカレンダーで開く/);
});
