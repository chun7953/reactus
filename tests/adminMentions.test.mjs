import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPath = new URL('../public/admin.js', import.meta.url);
const mentionsPath = new URL('../public/common/admin-mentions.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-enhancement-modules.js', import.meta.url);
const handlerPath = new URL('../src/web/adminHandler.js', import.meta.url);
const servicePath = new URL('../src/lib/webCalendarMentionService.js', import.meta.url);

test('core admin owns the rich mention editor before the Discord preview enhancement', async () => {
    const [admin, loader] = await Promise.all([
        readFile(adminPath, 'utf8'),
        readFile(loaderPath, 'utf8'),
    ]);
    assert.match(admin, /import \{ loadMentionConfig, mentionPayload, syncMentionRoleOptions \} from '\.\/common\/admin-mentions\.js';/);
    assert.match(loader, /import '\.\/admin-preview\.js';/);
    assert.doesNotMatch(loader, /import '\.\/admin-mentions\.js';/);
});

test('core role owner explicitly synchronizes the rich mention role selector', async () => {
    const [admin, mentions] = await Promise.all([
        readFile(adminPath, 'utf8'),
        readFile(mentionsPath, 'utf8'),
    ]);
    assert.match(admin, /function populateRoles\(\)[\s\S]*syncMentionRoleOptions\(\);\n}/);
    assert.match(mentions, /export function syncMentionRoleOptions\(\)/);
    assert.doesNotMatch(mentions, /roleObserver/);
    assert.doesNotMatch(mentions, /new MutationObserver\(/);
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

test('calendar editor merges structured metadata with inline legacy mention tokens', async () => {
    const service = await readFile(servicePath, 'utf8');
    assert.match(service, /detail\.mention\?\.mode === 'custom' \? \(detail\.mention\.targets \|\| \[\]\) : \[\]/);
    assert.match(service, /\.\.\.extracted\.targets/);
    assert.match(service, /targets = uniqueTargets\(targets\)/);
});
