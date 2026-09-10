import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const calendarEditPath = new URL('../public/common/admin-calendar-edit.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const retiredFeedbackPath = new URL('../public/common/admin-edit-feedback.js', import.meta.url);

test('month calendar integration loads with the dashboard', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(loader, /import '\.\/admin-calendar-edit\.js';/);
});

test('core admin editor owns recurring edit scopes and immediate feedback', async () => {
    const [source, loader] = await Promise.all([
        readFile(adminPath, 'utf8'),
        readFile(loaderPath, 'utf8'),
    ]);

    assert.match(source, /addEventListener\('reactus:edit-event'/);
    assert.match(source, /void editEvent\(source\)/);
    assert.match(source, /editButton\.addEventListener\('click', \(\) => editEvent\(event\)\)/);
    assert.match(source, /future\.value = 'future'/);
    assert.match(source, /future\.textContent = 'これ以降の予定'/);
    assert.match(source, /scope\.append\(instance, future, series\)/);
    assert.match(source, /beginEditFeedback\(event\)/);
    assert.match(source, /予定の内容を読み込んでいます…/);
    assert.match(source, /これ以降の予定を編集中/);
    assert.match(source, /選んだ回より前はそのまま残し、この回以降を新しい定期予定として編集します。/);
    assert.match(source, /「これ以降」または「すべての予定」を選ぶと変更できます。/);

    assert.doesNotMatch(loader, /installFutureScope/);
    assert.doesNotMatch(loader, /updateHint/);
    assert.doesNotMatch(loader, /admin-edit-feedback\.js/);
    await assert.rejects(readFile(retiredFeedbackPath, 'utf8'), error => error?.code === 'ENOENT');
});

test('month calendar click dispatches the existing editor from month-owned metadata and preserves modifier navigation', async () => {
    const source = await readFile(calendarEditPath, 'utf8');
    assert.match(source, /month-event\[data-reactus-event-id\]\[data-reactus-calendar-id\]/);
    assert.match(source, /dataset\.reactusCalendarId/);
    assert.match(source, /dataset\.reactusEventId/);
    assert.doesNotMatch(source, /\/api\/admin\/events/);
    assert.match(source, /new CustomEvent\('reactus:edit-event'/);
    assert.match(source, /event\.ctrlKey/);
    assert.match(source, /event\.metaKey/);
    assert.match(source, /event\.shiftKey/);
});
