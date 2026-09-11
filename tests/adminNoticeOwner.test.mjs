import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const commonRoot = new URL('public/common/', root);
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

async function adminRuntimeSources() {
  const entries = await readdir(commonRoot, { withFileTypes: true });
  const paths = [
    new URL('public/admin-entry.js', root),
    new URL('public/admin.js', root),
    ...entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
      .map(entry => new URL(`public/common/${entry.name}`, root)),
  ];
  return Promise.all(paths.map(async path => ({ path, source: await readFile(path, 'utf8') })));
}

test('admin notice DOM and hide timer have one canonical owner', async () => {
  const [owner, producer] = await Promise.all([
    readFile(ownerPath, 'utf8'),
    readFile(producerPath, 'utf8'),
  ]);

  assert.match(owner, /querySelector\('#notice'\)/);
  assert.match(owner, /clearTimeout\(hideTimer\)/);
  assert.match(owner, /setTimeout\(\(\) =>/);
  assert.match(owner, /ADMIN_NOTICE_EVENT/);
  assert.match(owner, /noticeVersion/);

  assert.match(producer, /new CustomEvent\(ADMIN_NOTICE_EVENT/);
  assert.doesNotMatch(producer, /#notice/);
  assert.doesNotMatch(producer, /setTimeout/);

  const runtimeSources = await adminRuntimeSources();
  for (const { path, source } of runtimeSources) {
    if (path.href === ownerPath.href) continue;
    assert.doesNotMatch(source, /#notice/, `${path.pathname} must not own the shared notice DOM`);
  }
});

test('notice consumers request rendering through the canonical producer', async () => {
  const sources = await Promise.all(consumerPaths.map(path => readFile(path, 'utf8')));
  for (const source of sources) {
    assert.match(source, /admin-notice|showAdminNotice|dismissAdminNotice/);
  }
});
