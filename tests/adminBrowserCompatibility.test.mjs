import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlPath = new URL('../public/admin.html', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const enhancementsEntryPath = new URL('../public/admin-enhancements-entry.js', import.meta.url);
const polyfillPath = new URL('../public/admin-polyfills.js', import.meta.url);
const serverPath = new URL('../src/web/server.js', import.meta.url);
const dockerPath = new URL('../Dockerfile', import.meta.url);
const enhancementModulesPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const retiredFutureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const retiredLoginPolishPath = new URL('../public/common/admin-login-link-polish.js', import.meta.url);

test('bundled and unbundled admin use the same canonical entry graph', async () => {
  const [server, html, entry] = await Promise.all([
    readFile(serverPath, 'utf8'),
    readFile(htmlPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  assert.match(server, /fs\.existsSync\(path\.join\(adminRoot, 'admin\.bundle\.js'\)\)/);
  assert.match(server, /<script src="\/admin\.bundle\.js/);
  assert.match(server, /admin-enhancements\.bundle\.js/);
  assert.match(server, /admin-enhancements-entry\.js/);
  assert.match(server, /__reactusAdminEnhancementSrc/);
  assert.match(server, /__reactusAdminEnhancementModule/);
  assert.doesNotMatch(server, /const startupGuard =/);
  assert.match(server, /<noscript>/);

  assert.match(html, /<script type="module" src="\/admin-entry\.js"><\/script>/);
  assert.doesNotMatch(html, /admin-calendar-polish\.js/);
  assert.doesNotMatch(html, /common\/admin-event-fetch-cache\.js/);
  assert.doesNotMatch(html, /<script type="module" src="\/admin\.js"/);
  assert.match(html, /observer\.observe\(app, \{ attributes: true, attributeFilter: \['class'\] \}\)/);
  assert.match(html, /observer\.observe\(loginRequired, \{ attributes: true, attributeFilter: \['class'\] \}\)/);

  assert.match(entry, /__reactusAdminEnhancementModule === true/);
});

test('production image splits bootstrap-critical admin code from heavy UI enhancements', async () => {
  const [entry, enhancements, docker] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(enhancementsEntryPath, 'utf8'),
    readFile(dockerPath, 'utf8'),
  ]);

  assert.match(entry, /admin-polyfills\.js/);
  assert.doesNotMatch(entry, /admin-event-fetch-cache\.js/);
  assert.match(entry, /\.\/admin\.js/);
  assert.doesNotMatch(entry, /admin-tools\.js/);
  assert.doesNotMatch(entry, /admin-calendar-polish\.js/);
  assert.doesNotMatch(entry, /admin-future-scope\.js/);
  assert.match(entry, /appIsVisible/);
  assert.match(entry, /__reactusAdminEnhancementSrc/);
  assert.match(entry, /new MutationObserver\(startEnhancements\)/);

  assert.doesNotMatch(enhancements, /admin-observer-guard\.js/);
  assert.match(enhancements, /admin-tools\.js/);
  assert.match(enhancements, /admin-enhancement-modules\.js/);
  assert.doesNotMatch(enhancements, /admin-future-scope\.js/);
  assert.doesNotMatch(enhancements, /admin-calendar-polish\.js/);
  await assert.rejects(readFile(retiredFutureScopePath, 'utf8'), error => error?.code === 'ENOENT');

  assert.match(docker, /esbuild@0\.25\.9/);
  assert.match(docker, /--target=chrome55/);
  assert.match(docker, /--outfile=public\/admin\.bundle\.js/);
  assert.match(docker, /--outfile=public\/admin-enhancements\.bundle\.js/);
});

test('bundled compatibility path polyfills helpers used by admin modules', async () => {
  const source = await readFile(polyfillPath, 'utf8');
  assert.match(source, /Object\.fromEntries/);
  assert.match(source, /Array\.prototype\.flatMap/);
  assert.match(source, /String\.prototype\.replaceAll/);
  assert.match(source, /String\.prototype\.padStart/);
  assert.match(source, /window\.queueMicrotask/);
  assert.match(source, /Element\.prototype\.append/);
  assert.match(source, /Element\.prototype\.prepend/);
  assert.match(source, /Element\.prototype\.before/);
  assert.match(source, /Element\.prototype\.after/);
  assert.match(source, /Element\.prototype\.replaceWith/);
  assert.match(source, /Element\.prototype\.replaceChildren/);
});

test('admin bootstrap leaves browser fetch ownership untouched', async () => {
  const entry = await readFile(entryPath, 'utf8');
  assert.doesNotMatch(entry, /window\.fetch\s*=/);
  assert.doesNotMatch(entry, /admin-event-fetch-cache\.js/);
});

test('core entry clears an expired one-time login state after a valid session becomes active', async () => {
  const [entry, enhancementModules] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(enhancementModulesPath, 'utf8'),
  ]);
  assert.match(entry, /function clearExpiredLoginStateForActiveSession\(\)/);
  assert.match(entry, /login.*expired/);
  assert.match(entry, /ログインリンクの有効期限が切れています/);
  assert.match(entry, /history\.replaceState/);
  assert.match(entry, /clearExpiredLoginStateForActiveSession\(\);/);
  assert.doesNotMatch(enhancementModules, /admin-login-link-polish\.js/);
  await assert.rejects(readFile(retiredLoginPolishPath, 'utf8'), error => error?.code === 'ENOENT');
});
