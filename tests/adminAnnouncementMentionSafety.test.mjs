import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  analyzeAnnouncementMentions,
  hasAnnouncementMentions,
  mentionSummary,
} from '../public/common/admin-announcement-mention-utils.js';

const ownerPath = new URL('../public/common/admin-announcements.js', import.meta.url);
const retiredSafetyPath = new URL('../public/common/admin-announcement-safety.js', import.meta.url);
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

test('announcement owner renders warning and confirms before sending mention-bearing content', async () => {
  const [ownerSource, entrySource] = await Promise.all([
    readFile(ownerPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);
  assert.match(ownerSource, /admin-announcement-mention-utils\.js/);
  assert.match(ownerSource, /id="announcementMentionWarning"/);
  assert.match(ownerSource, /チャンネルへのリンクは通知を送りません/);
  assert.match(ownerSource, /新しい発言のたびに一番下へ再投稿/);
  assert.match(ownerSource, /繰り返し通知される可能性/);
  assert.match(ownerSource, /function confirmMentionedAnnouncement\(message\)/);
  assert.match(ownerSource, /if \(!confirmMentionedAnnouncement\(message\)\) return;/);
  assert.match(ownerSource, /#announcementMessage'\)\.addEventListener\('input'/);
  assert.match(ownerSource, /renderMentionWarning\(\)/);
  assert.doesNotMatch(ownerSource, /document\.addEventListener\('submit'/);
  assert.doesNotMatch(ownerSource, /document\.addEventListener\('input'/);
  assert.doesNotMatch(entrySource, /admin-announcement-safety\.js/);
  await assert.rejects(readFile(retiredSafetyPath, 'utf8'), error => error?.code === 'ENOENT');
});
