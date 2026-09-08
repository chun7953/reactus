import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mentionsPath = new URL('../public/common/admin-mentions.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const servicePath = new URL('../src/lib/webCalendarMentionService.js', import.meta.url);

test('admin loads the rich mention editor before the Discord preview', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(loader, /import '\.\/admin-mentions\.js';\s*import '\.\/admin-preview\.js';/s);
});

test('rich mention editor supports roles, users, everyone, here and multiple targets', async () => {
    const source = await readFile(mentionsPath, 'utf8');
    assert.match(source, /MAX_TARGETS = 20/);
    assert.match(source, /addEveryoneMention/);
    assert.match(source, /addHereMention/);
    assert.match(source, /richMentionRole/);
    assert.match(source, /richMentionMemberSearch/);
    assert.match(source, /mode: 'custom'/);
    assert.match(source, /targets: mentionState\.targets/);
});

test('custom mention UI keeps the legacy form in none mode so the default role is not previewed or sent', async () => {
    const source = await readFile(mentionsPath, 'utf8');
    assert.match(source, /mentionState\.mode === 'custom' \? 'none' : mentionState\.mode/);
    assert.doesNotMatch(source, /previewObserver/);
});

test('admin exposes on-demand Discord member search instead of bootstrapping all members', async () => {
    const handler = await readFile(handlerPath, 'utf8');
    assert.match(handler, /pathname === '\/api\/admin\/members'/);
    assert.match(handler, /guild\.members\.search\(\{ query, limit: 25 \}\)/);
    assert.match(handler, /guild\.members\.fetch\(query\)/);
    assert.doesNotMatch(handler, /members:\s*\[\.\.\.auth\.guild\.members/);
});

test('calendar admin routes create, read and update through the rich mention service', async () => {
    const handler = await readFile(handlerPath, 'utf8');
    assert.match(handler, /from '\.\.\/lib\/webCalendarMentionService\.js'/);
    const service = await readFile(servicePath, 'utf8');
    assert.match(service, /payloadWithRichMention/);
    assert.match(service, /patchMentionMetadata/);
    assert.match(service, /extractTargets/);
});
