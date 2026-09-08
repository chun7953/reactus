import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const databasePath = new URL('../src/db/database.js', import.meta.url);

test('production database pool keeps established connections alive', async () => {
  const source = await readFile(databasePath, 'utf8');
  assert.match(source, /idleTimeoutMillis:\s*0/);
  assert.match(source, /keepAlive:\s*true/);
  assert.match(source, /keepAliveInitialDelayMillis:\s*10000/);
});
