import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const ownerPath = new URL('public/common/admin-notice-owner.js', root);
const producerPath = new URL('public/common/admin-notice.js', root);
const consumerPaths = [
  new URL('public/admin-entry.js', root),
  new URL('public/admin.js', root),
  new URL('public/common/admin-mentions.js', root),
  new URL('public/common/admin-tools.js', root),
  new URL('public/common/admin-announcements.js', root),
  new URL('public/common/admin-calendar-drag.js', root),
  new URL('public/common/admin-calendar-quick-create.js', root),
  new URL('public/common/admin-calendar-settings.js', root),
];

test('admin notice DOM and hide timer have one canonical owner', async () => {
  const [owner, producer, ...consumers] = await Promise.all([
    readFile(ownerPath, 'utf8'),
    readFile(producerPath, 'utf8'),
    ...consumerPaths.map(path => readFile(path, 'utf8')),
  ]);

  assert.match(owner, /querySelector\('#notice'\)/);
  assert.match(owner, /clearTimeout\(hideTimer\)/);
  assert.match(owner, /setTimeout\(\(\) =>/);
  assert.match(owner, /ADMIN_NOTICE_EVENT/);
  assert.match(owner, /noticeVersion/);

  assert.match(producer, /new CustomEvent\(ADMIN_NOTICE_EVENT/);
  assert.doesNotMatch(producer, /#notice/);
  assert.doesNotMatch(producer, /setTimeout/);

  for (const source of consumers) {
    assert.doesNotMatch(source, /#notice/);
    assert.doesNotMatch(source, /classList\.add\('hidden'\).*7000/);
  }
});

test('notice consumers request rendering through the canonical producer', async () => {
  const sources = await Promise.all(consumerPaths.map(path => readFile(path, 'utf8')));
  for (const source of sources) {
    assert.match(source, /admin-notice|showAdminNotice|dismissAdminNotice/);
  }
});
