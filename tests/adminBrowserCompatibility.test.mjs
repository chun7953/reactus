import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlPath = new URL('../public/admin.html', import.meta.url);
const entryPath = new URL('../public/admin-entry.js', import.meta.url);
const enhancementsEntryPath = new URL('../public/admin-enhancements-entry.js', import.meta.url);
const polyfillPath = new URL('../public/admin-polyfills.js', import.meta.url);
const fetchCachePath = new URL('../public/common/admin-event-fetch-cache.js', import.meta.url);
const serverPath = new URL('../src/web/server.js', import.meta.url);
const dockerPath = new URL('../Dockerfile', import.meta.url);
const futureScopePath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const loginPolishPath = new URL('../public/common/admin-login-link-polish.js', import.meta.url);

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
  assert.match(entry, /admin-event-fetch-cache\.js/);
  assert.match(entry, /\.\/admin\.js/);
  assert.doesNotMatch(entry, /admin-tools\.js/);
  assert.doesNotMatch(entry, /admin-calendar-polish\.js/);
  assert.doesNotMatch(entry, /admin-future-scope\.js/);
  assert.match(entry, /appIsVisible/);
  assert.match(entry, /__reactusAdminEnhancementSrc/);
  assert.match(entry, /new MutationObserver\(startEnhancements\)/);

  assert.doesNotMatch(enhancements, /admin-observer-guard\.js/);
  assert.match(enhancements, /admin-tools\.js/);
  assert.match(enhancements, /admin-future-scope\.js/);
  assert.doesNotMatch(enhancements, /admin-calendar-polish\.js/);

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

test('admin fetch wrapper degrades safely when AbortController is unavailable', async () => {
  const source = await readFile(fetchCachePath, 'utf8');
  assert.match(source, /typeof AbortController === 'function'/);
  assert.match(source, /if \(controller\) requestOptions\.signal = controller\.signal/);
  assert.match(source, /if \(timer !== null\) window\.clearTimeout\(timer\)/);
});

test('an expired one-time login link does not keep warning on a browser with a valid session', async () => {
  const [futureScope, polish] = await Promise.all([
    readFile(futureScopePath, 'utf8'),
    readFile(loginPolishPath, 'utf8'),
  ]);
  assert.match(futureScope, /admin-login-link-polish\.js/);
  assert.match(polish, /login.*expired/);
  assert.match(polish, /#app/);
  assert.match(polish, /ログインリンクの有効期限が切れています/);
  assert.match(polish, /classList\.add\('hidden'\)/);
  assert.match(polish, /history\.replaceState/);
});
