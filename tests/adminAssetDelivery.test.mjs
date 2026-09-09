import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverPath = new URL('../src/web/server.js', import.meta.url);

test('admin assets are not served from a stale five-minute browser cache', async () => {
  const source = await readFile(serverPath, 'utf8');
  assert.match(source, /base\.startsWith\('admin'\)/);
  assert.match(source, /return 'no-store'/);
  assert.match(source, /adminAssetVersion/);
  assert.match(source, /href="\\\/admin\\\.css"/);
  assert.match(source, /admin-entry\\\.js/);
  assert.match(source, /admin-enhancements-entry\\\.js/);
  assert.match(source, /__reactusAdminEnhancementModule/);
  assert.match(source, /\?v=\$\{adminAssetVersion\}/);
});
