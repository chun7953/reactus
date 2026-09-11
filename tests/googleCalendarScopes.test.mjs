import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sheetsApiPath = new URL('../src/lib/sheetsAPI.js', import.meta.url);

test('Google Calendar scopes stay limited to event access and read-only calendar metadata', async () => {
    const source = await readFile(sheetsApiPath, 'utf8');

    assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);
    assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/calendar\.calendars\.readonly/);
    assert.doesNotMatch(source, /https:\/\/www\.googleapis\.com\/auth\/calendar\.readonly['"]/);
    assert.doesNotMatch(source, /https:\/\/www\.googleapis\.com\/auth\/calendar\.calendars['"]/);
    assert.doesNotMatch(source, /https:\/\/www\.googleapis\.com\/auth\/calendar['"]/);
});
