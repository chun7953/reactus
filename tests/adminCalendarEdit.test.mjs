import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const calendarEditPath = new URL('../public/common/admin-calendar-edit.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('month calendar integration loads with the dashboard', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(loader, /import '\.\/admin-calendar-edit\.js';/);
});

test('main admin editor accepts calendar edit events', async () => {
    const source = await readFile(adminPath, 'utf8');
    assert.match(source, /addEventListener\('reactus:edit-event'/);
    assert.match(source, /void editEvent\(source\)/);
});

test('month calendar click dispatches the existing editor and preserves modifier navigation', async () => {
    const source = await readFile(calendarEditPath, 'utf8');
    assert.match(source, /#monthGrid \.month-event\[href\]/);
    assert.match(source, /new CustomEvent\('reactus:edit-event'/);
    assert.match(source, /event\.ctrlKey/);
    assert.match(source, /event\.metaKey/);
    assert.match(source, /event\.shiftKey/);
});
