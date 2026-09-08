import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const previewPath = new URL('../public/common/admin-preview.js', import.meta.url);
const loaderPath = new URL('../public/common/admin-future-scope.js', import.meta.url);

test('admin Discord preview is loaded by the dashboard', async () => {
    const loader = await readFile(loaderPath, 'utf8');
    assert.match(loader, /import '\.\/admin-preview\.js';/);
});

test('admin Discord preview covers posts, multi-prize giveaways, mentions, images and reactions', async () => {
    const source = await readFile(previewPath, 'utf8');
    assert.match(source, /function normalPreview/);
    assert.match(source, /function giveawayPreview/);
    assert.match(source, /\.prize-row/);
    assert.match(source, /selectedMention/);
    assert.match(source, /previewImage/);
    assert.match(source, /reactionRules/);
    assert.match(source, /guildEmojis/);
});
