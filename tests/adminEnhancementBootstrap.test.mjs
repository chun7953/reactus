import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const providerPath = new URL('../public/common/admin-enhancement-bootstrap.js', import.meta.url);
const consumerPaths = [
  new URL('../public/common/admin-tools.js', import.meta.url),
  new URL('../public/common/admin-preview.js', import.meta.url),
  new URL('../public/common/admin-announcements.js', import.meta.url),
  new URL('../public/common/admin-calendar-settings.js', import.meta.url),
];

test('enhancement bootstrap data has one shared owner', async () => {
  const [provider, ...consumers] = await Promise.all([
    readFile(providerPath, 'utf8'),
    ...consumerPaths.map(path => readFile(path, 'utf8')),
  ]);

  assert.match(provider, /fetch\('\/api\/admin\/bootstrap'/);
  assert.match(provider, /if \(!force && bootstrap\) return bootstrap/);
  assert.match(provider, /if \(loading\)/);
  assert.match(provider, /export async function loadEnhancementBootstrap/);

  for (const source of consumers) {
    assert.match(source, /loadEnhancementBootstrap/);
    assert.doesNotMatch(source, /(?:fetch|Api|api)\('\/api\/admin\/bootstrap'/);
  }
});

test('reaction tools explicitly refresh the shared bootstrap only after mutations', async () => {
  const tools = await readFile(consumerPaths[0], 'utf8');
  assert.match(tools, /reloadToolsBootstrap\(\{ force: true \}\)/);
  assert.match(tools, /loadEnhancementBootstrap\(\{ force \}\)/);
});
