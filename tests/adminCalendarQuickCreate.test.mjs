import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const quickPath = new URL('../public/common/admin-calendar-quick-create.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);

test('month calendar loads quick-create controls', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(loader, /import '\.\/admin-calendar-quick-create\.js';/);

    const source = await readFile(quickPath, 'utf8');
    assert.match(source, /month-add-schedule/);
    assert.match(source, /prepareNewSchedule/);
    assert.match(source, /reactusDate/);
    assert.match(source, /scrollIntoView/);
});

test('quick-create preserves the existing start time and giveaway duration', async () => {
    const source = await readFile(quickPath, 'utf8');
    assert.match(source, /oldEnd > oldStart/);
    assert.match(source, /oldEnd - oldStart/);
    assert.match(source, /T\(\\d\{2\}:\\d\{2\}\)\$/);
    assert.match(source, /nextStart \+ durationMs/);
});

test('quick-create exits edit mode and provides a current-month shortcut', async () => {
    const source = await readFile(quickPath, 'utf8');
    assert.match(source, /cancelEdit\.click\(\)/);
    assert.match(source, /monthToday/);
    assert.match(source, /goToCurrentMonth/);
});
