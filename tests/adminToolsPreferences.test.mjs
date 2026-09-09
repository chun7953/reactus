import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const toolsPath = new URL('../public/common/admin-tools.js', import.meta.url);
const calendarShellPath = new URL('../public/common/admin-calendar-shell.js', import.meta.url);

test('frequent emoji choices come from configured auto-reaction rules', async () => {
  const source = await readFile(toolsPath, 'utf8');
  assert.match(source, /function frequentReactionEmojis\(\)/);
  assert.match(source, /toolsState\.bootstrap\?\.reactionRules/);
  assert.match(source, /b\.count - a\.count \|\| a\.order - b\.order/);
  assert.match(source, /設定済みの自動リアクションで使われている絵文字/);
});

test('month calendar is inserted before the schedule panel by its sole shell owner', async () => {
  const source = await readFile(calendarShellPath, 'utf8');
  assert.match(source, /const schedule = calendarShellQuery\('#schedulePanel'\)/);
  assert.match(source, /schedule\.before\(section\)/);
  assert.match(source, /section\.id = 'calendarOverview'/);
});
