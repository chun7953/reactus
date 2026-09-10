import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const guidePath = new URL('../public/common/admin-beginner-guide.js', import.meta.url);
const retiredJapaneseUiPath = new URL('../public/common/admin-japanese-ui.js', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const htmlPath = new URL('../public/admin.html', import.meta.url);
const cssPath = new URL('../public/admin.css', import.meta.url);

test('primary web admin markup is Japanese before enhancement modules run', async () => {
  const source = await readFile(htmlPath, 'utf8');
  assert.match(source, /<title>Reactus 管理画面<\/title>/);
  assert.match(source, /<h1>Reactus 管理画面<\/h1>/);
  assert.match(source, /<section id="schedulePanel" class="panel">/);
  assert.match(source, /<p class="eyebrow">新しい予定<\/p>/);
  assert.match(source, /<p class="eyebrow">今後の予定<\/p>/);
  assert.match(source, /Googleカレンダー上の予定の長さ/);
  assert.match(source, /メンション（通知）/);
  assert.match(source, /いつもの設定を使う/);
  assert.match(source, /この予定だけ別のロールを使う/);
  assert.doesNotMatch(source, />NEW SCHEDULE</);
  assert.doesNotMatch(source, />UPCOMING</);
});

test('redundant small eyebrow headings are not rendered', async () => {
  const source = await readFile(cssPath, 'utf8');
  assert.match(source, /\.eyebrow \{ display: none; \}/);
});

test('beginner guide does not repair owner-rendered wording or panel identity', async () => {
  const [guide, modules] = await Promise.all([
    readFile(guidePath, 'utf8'),
    readFile(enhancementModulesPath, 'utf8'),
  ]);

  assert.match(modules, /admin-beginner-guide\.js/);
  assert.doesNotMatch(modules, /admin-japanese-ui\.js/);
  assert.doesNotMatch(guide, /japaneseLabels/);
  assert.doesNotMatch(guide, /beginnerFriendlyText/);
  assert.doesNotMatch(guide, /beginnerPhrasePatterns/);
  assert.doesNotMatch(guide, /replaceEnglishEyebrows/);
  assert.doesNotMatch(guide, /replaceTechnicalLabels/);
  assert.doesNotMatch(guide, /replaceTechnicalSentences/);
  assert.doesNotMatch(guide, /preparePanelIds/);
  assert.doesNotMatch(guide, /querySelectorAll/);
  await assert.rejects(readFile(retiredJapaneseUiPath, 'utf8'), error => error?.code === 'ENOENT');
});

test('web admin offers purpose-based navigation for common tasks without duplicating calendar settings', async () => {
  const source = await readFile(guidePath, 'utf8');
  assert.match(source, /何をしたいですか？/);
  assert.match(source, /予定・抽選を作る/);
  assert.match(source, /チャンネル下部に案内を出す/);
  assert.match(source, /カレンダーを見る/);
  assert.match(source, /自動リアクションを設定する/);
  assert.doesNotMatch(source, /title: 'Googleカレンダー・投稿先を設定する'/);
  assert.match(source, /document\.querySelector\('#schedulePanel'\)/);
  assert.match(source, /schedulePanel\.before\(guide\)/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test('event cards own the Japanese Google Calendar link text', async () => {
  const source = await readFile(adminPath, 'utf8');
  assert.match(source, /open\.textContent = 'Googleカレンダーで開く'/);
});
