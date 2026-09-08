import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const monitorPath = new URL('../src/lib/taskMonitor.js', import.meta.url);

test('calendar monitor resolves recurring metadata before mentions and guild-scoped images', async () => {
    const source = await readFile(monitorPath, 'utf8');
    assert.match(source, /resolveCalendarEventPrivateProperties/);
    assert.match(source, /masterMetadataCache = new Map\(\)/);
    assert.match(source, /eventMentions\(privateProperties, monitor\)/);
    assert.match(source, /eventImageFile\(privateProperties, monitor\.guild_id\)/);
});

test('calendar monitor uses the shared Discord mention parser for everyone and here', async () => {
    const source = await readFile(monitorPath, 'utf8');
    assert.match(source, /eventMentionTokens/);
    assert.match(source, /extractDiscordMentions\(line\)/);
    assert.match(source, /extractDiscordMentions\(eventDescription\)/);
    assert.match(source, /parsedMentions\.mentions\.forEach/);
    assert.match(source, /parsedDescription\.mentions\.forEach/);
    assert.doesNotMatch(source, /line\.match\(\/<@&\[0-9\]/);
});
