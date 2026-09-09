import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const feedbackPath = new URL('../public/common/admin-edit-feedback.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('future-scope bundle loads immediate edit feedback', async () => {
  const source = await readFile(loaderPath, 'utf8');
  assert.match(source, /import '\.\/admin-edit-feedback\.js';/);
});

test('upcoming edit click immediately scrolls to the editor and shows loading state', async () => {
  const source = await readFile(feedbackPath, 'utf8');
  assert.match(source, /#eventList \.event-actions button/);
  assert.match(source, /予定の内容を読み込んでいます…/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(source, /「\$\{label\}」を編集中/);
});

test('calendar edit events receive the same immediate feedback', async () => {
  const source = await readFile(feedbackPath, 'utf8');
  assert.match(source, /addEventListener\('reactus:edit-event'/);
  assert.match(source, /event\.detail\?\.summary/);
  assert.match(source, /beginEditFeedback\(label\)/);
});
