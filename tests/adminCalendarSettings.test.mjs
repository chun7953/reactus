import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const panelPath = new URL('../public/common/admin-calendar-settings.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);

test('dashboard loads calendar integration settings', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(loader, /import '\.\/admin-calendar-settings\.js';/);

    const panel = await readFile(panelPath, 'utf8');
    assert.match(panel, /カレンダー連携設定/);
    assert.match(panel, /\/api\/admin\/calendar-monitors/);
    assert.match(panel, /\/api\/admin\/calendar-monitors\/update/);
    assert.match(panel, /\/api\/admin\/calendar-monitors\/delete/);
    assert.match(panel, /\/api\/admin\/main-calendar/);
    assert.match(panel, /既存予定はReactusから投稿されなくなります/);
});

test('web admin protects main calendar changes with Administrator permission', async () => {
    const handler = await readFile(handlerPath, 'utf8');
    assert.match(handler, /function requireAdministrator\(auth\)/);
    assert.match(handler, /PermissionsBitField\.Flags\.Administrator/);
    assert.match(handler, /pathname === '\/api\/admin\/main-calendar'/);
    assert.match(handler, /requireAdministrator\(auth\)/);
});

test('bootstrap exposes monitor settings and main calendar permission to the dashboard', async () => {
    const handler = await readFile(handlerPath, 'utf8');
    assert.match(handler, /mainCalendarId/);
    assert.match(handler, /manageMainCalendar/);
    assert.match(handler, /defaultMentionRoleId/);
    assert.match(handler, /calendarId: monitor\.calendar_id/);
});
