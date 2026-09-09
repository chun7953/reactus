import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = {
  preview: new URL('../public/common/admin-preview.js', import.meta.url),
  tools: new URL('../public/common/admin-tools.js', import.meta.url),
  calendarSettings: new URL('../public/common/admin-calendar-settings.js', import.meta.url),
  extras: new URL('../src/lib/webAdminExtrasService.js', import.meta.url),
  monitor: new URL('../src/lib/webCalendarMonitorService.js', import.meta.url),
};

test('web admin uses beginner-friendly wording for reaction rules and calendar matching', async () => {
  const entries = Object.fromEntries(await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
  ));

  assert.match(entries.preview, /自動リアクション（反応する言葉:/);
  assert.match(entries.tools, /反応する言葉を入力してください。/);
  assert.match(entries.extras, /反応する言葉を入力してください。/);
  assert.match(entries.monitor, /予定を見分ける合図（キーワード）を入力してください。/);
  assert.match(entries.calendarSettings, /投稿先や、予定を見分ける合図を追加・変更/);
  assert.match(entries.calendarSettings, /Googleカレンダーから直接作る予定の合図/);
  assert.match(entries.calendarSettings, /いつも付けるメンション/);
  assert.match(entries.calendarSettings, /投稿先の設定を追加/);
  assert.doesNotMatch(entries.preview, /トリガー:/);
  assert.doesNotMatch(entries.tools, /トリガーを入力してください/);
});
