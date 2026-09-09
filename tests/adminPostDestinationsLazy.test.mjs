import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const modulePath = new URL('../public/common/admin-post-destinations.js', import.meta.url);
const entryPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('post destinations load after the admin shell and refresh on channel interaction', async () => {
  const [source, entry] = await Promise.all([
    readFile(modulePath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  assert.match(entry, /import '\.\/admin-post-destinations\.js';/);
  assert.match(source, /refreshAfterInitialRender\(\)/);
  assert.match(source, /channels=\$\{encodeURIComponent\(mode\)\}/);
  assert.match(source, /const mode = force \? 'refresh' : '1'/);
  assert.match(source, /select\.addEventListener\('focus'/);
  assert.match(source, /select\.addEventListener\('change'/);
  assert.match(source, /document\.querySelectorAll\('\.segment'\)/);
  assert.match(source, /reactus:edit-event/);
});

test('lazy destination renderer repairs monitor options overwritten by the base editor', async () => {
  const source = await readFile(modulePath, 'utf8');
  assert.match(source, /new MutationObserver/);
  assert.match(source, /observer\.observe\(select, \{ childList: true \}\)/);
  assert.match(source, /destinationState\.rendering/);
  assert.match(source, /renderDestinations\(\)/);
});