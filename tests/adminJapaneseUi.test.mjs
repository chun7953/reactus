import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const uiPath = new URL('../public/common/admin-japanese-ui.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);

test('primary web admin markup is Japanese before helper scripts run', async () => {
  const source = await readFile(htmlPath, 'utf8');
  assert.match(source, /<title>Reactus 管理画面<\/title>/);
  assert.match(source, /<h1>Reactus 管理画面<\/h1>/);
  assert.match(source, /<p class="eyebrow">新しい予定<\/p>/);
  assert.match(source, /<p class="eyebrow">今後の予定<\/p>/);
  assert.match(source, /Googleカレンダー上の予定の長さ/);
  assert.match(source, /メンション（通知）/);
  assert.match(source, /いつもの設定を使う/);
  assert.match(source, /この予定だけ別のロールを使う/);
  assert.doesNotMatch(source, />NEW SCHEDULE</);
  assert.doesNotMatch(source, />UPCOMING</);
});

test('web admin keeps Japanese fallbacks for dynamically created sections', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /\['EDIT SCHEDULE', '予定を編集中'\]/);
  assert.match(source, /\['CALENDAR', '月カレンダー'\]/);
  assert.match(source, /\['REACTIONS', '自動リアクション'\]/);
  assert.doesNotMatch(source, /\['HISTORY', '予定の履歴'\]/);
});

test('web admin explains technical settings in beginner-friendly words', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /予定を見分ける合図（キーワード）/);
  assert.match(source, /投稿先とカレンダーの設定/);
  assert.match(source, /Googleカレンダー・投稿先の設定を開く/);
  assert.match(source, /反応する言葉/);
  assert.match(source, /自動で付ける絵文字/);
  assert.match(source, /Reactus 管理画面/);
  assert.match(source, /自動リアクション（反応する言葉:/);
  assert.match(source, /反応する言葉を入力してください。/);
  assert.match(source, /予定を見分ける合図（キーワード）を入力してください。/);
  assert.match(source, /投稿先や予定を見分ける合図を追加・変更/);
  assert.match(source, /抽選用は予定を見分ける合図を「ラキショ」にします。/);
  assert.match(source, /\.hint,.discord-preview-meta,#notice/);
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
