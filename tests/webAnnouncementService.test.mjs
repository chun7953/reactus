import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_ANNOUNCEMENT_LENGTH,
  normalizeAnnouncementText,
} from '../src/lib/webAnnouncementService.js';

const servicePath = new URL('../src/lib/webAnnouncementService.js', import.meta.url);

test('sticky announcement preserves line breaks, URLs, and Discord channel links', () => {
  const input = '質問はこちら\r\n<#123456789012345678>\r\nhttps://example.com/help';
  assert.equal(
    normalizeAnnouncementText(input),
    '質問はこちら\n<#123456789012345678>\nhttps://example.com/help',
  );
});

test('sticky announcement rejects blank text and Discord-overlong messages', () => {
  assert.throws(() => normalizeAnnouncementText('  \n  '), /案内文を入力/);
  assert.throws(() => normalizeAnnouncementText('あ'.repeat(MAX_ANNOUNCEMENT_LENGTH + 1)), /2000文字以内/);
  assert.equal(normalizeAnnouncementText('あ'.repeat(MAX_ANNOUNCEMENT_LENGTH)).length, MAX_ANNOUNCEMENT_LENGTH);
});

test('sticky announcement cleanup supports stale channels and replaces visible copies', async () => {
  const source = await readFile(servicePath, 'utf8');
  assert.match(source, /messages\.fetch\(\{ limit: 100 \}\)/);
  assert.match(source, /deleteVisibleCopies\(channel, \[previousMessage, message\]\)/);
  assert.match(source, /const channelId = normalizeChannelId\(payload\?\.channelId\)/);
  assert.match(source, /guild\.channels\.fetch\(channelId\)\.catch\(\(\) => null\)/);
  assert.match(source, /MessageFlags\.SuppressEmbeds/);
});
