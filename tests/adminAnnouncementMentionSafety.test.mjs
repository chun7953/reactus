import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  analyzeAnnouncementMentions,
  hasAnnouncementMentions,
  mentionSummary,
} from '../public/common/admin-announcement-mention-utils.js';

const safetyPath = new URL('../public/common/admin-announcement-safety.js', import.meta.url);
const entryPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);

test('channel links are not treated as notification mentions', () => {
  const info = analyzeAnnouncementMentions('詳しくは <#123456789012345678> を見てください');
  assert.deepEqual(info, { everyone: false, here: false, roleCount: 0, userCount: 0 });
  assert.equal(hasAnnouncementMentions(info), false);
});

test('sticky announcement mention analysis detects repeated-notification risks', () => {
  const info = analyzeAnnouncementMentions(
    '@everyone @here <@&111111111111111111> <@&111111111111111111> <@222222222222222222> <@!333333333333333333>',
  );
  assert.deepEqual(info, { everyone: true, here: true, roleCount: 1, userCount: 2 });
  assert.equal(hasAnnouncementMentions(info), true);
  assert.equal(mentionSummary(info), '@everyone、@here、ロール 1件、ユーザー 2件');
});

test('broadcast mentions are detected even when placed next to punctuation', () => {
  const info = analyzeAnnouncementMentions('重要:@everyone／補足（@here）');
  assert.equal(info.everyone, true);
  assert.equal(info.here, true);
  assert.equal(hasAnnouncementMentions(info), true);
});

test('web admin warns and confirms before saving a sticky announcement with mentions', async () => {
  const [safetySource, entrySource] = await Promise.all([
    readFile(safetyPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);
  assert.match(safetySource, /新しい発言のたびに一番下へ再投稿/);
  assert.match(safetySource, /繰り返し通知される可能性/);
  assert.match(safetySource, /window\.confirm/);
  assert.match(safetySource, /チャンネルへのリンクは通知を送りません/);
  assert.match(entrySource, /admin-announcement-safety\.js/);
});
