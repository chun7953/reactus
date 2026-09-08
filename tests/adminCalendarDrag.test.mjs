import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dragPath = new URL('../public/common/admin-calendar-drag.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);

test('dashboard loads drag controls after quick-create date bindings', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(
        loader,
        /import '\.\/admin-calendar-quick-create\.js';\s*import '\.\/admin-calendar-drag\.js';/s,
    );
});

test('dragging a one-off month event calls the dedicated move API', async () => {
    const source = await readFile(dragPath, 'utf8');
    assert.match(source, /draggable = true/);
    assert.match(source, /month-day\[data-reactus-date\]/);
    assert.match(source, /\/api\/admin\/move/);
    assert.match(source, /calendarId: event\.calendarId/);
    assert.match(source, /eventId: event\.id/);
    assert.match(source, /newDate/);
});

test('recurring month events are not silently drag-moved', async () => {
    const source = await readFile(dragPath, 'utf8');
    assert.match(source, /source\.recurringEventId/);
    assert.match(source, /定期予定はドラッグ移動できません/);
    assert.match(source, /この予定のみ \/ これ以降 \/ すべて/);
});

test('web admin exposes the authenticated move endpoint', async () => {
    const handler = await readFile(handlerPath, 'utf8');
    assert.match(handler, /import \{ moveWebSchedule \} from '\.\.\/lib\/webCalendarMoveService\.js'/);
    assert.match(handler, /pathname === '\/api\/admin\/move'/);
    assert.match(handler, /moveWebSchedule\(auth\.session\.guild_id/);
});
