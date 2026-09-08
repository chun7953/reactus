import test from 'node:test';
import assert from 'node:assert/strict';

import {
    descriptorsForClient,
    descriptorsToReactionCsv,
    isDiscordUnicodeEmoji,
    normalizeDiscordEmojiList,
    normalizeDiscordEmojiToken,
    resolveDiscordReactionValues,
} from '../src/lib/discordEmoji.js';

test('accepts single Discord-style Unicode emoji graphemes', () => {
    for (const emoji of ['🔴', '⭕', '❤️', '👍', '1️⃣', '🇯🇵']) {
        assert.equal(isDiscordUnicodeEmoji(emoji), true, emoji);
    }
    assert.equal(isDiscordUnicodeEmoji('赤'), false);
    assert.equal(isDiscordUnicodeEmoji('🔴⭕'), false);
});

test('accepts custom emoji only when it belongs to the active guild', () => {
    const guildIds = new Set(['123456789012345678']);
    assert.deepEqual(
        normalizeDiscordEmojiToken('<:sample:123456789012345678>', { guildEmojiIds: guildIds }),
        { type: 'custom', id: '123456789012345678' },
    );
    assert.throws(
        () => normalizeDiscordEmojiToken('<:other:999999999999999999>', { guildEmojiIds: guildIds }),
        /利用できないカスタム絵文字/,
    );
});

test('deduplicates and limits configured reactions', () => {
    const result = normalizeDiscordEmojiList(['🔴', '🔴', '⭕']);
    assert.deepEqual(result, [
        { type: 'unicode', value: '🔴' },
        { type: 'unicode', value: '⭕' },
    ]);
    assert.throws(() => normalizeDiscordEmojiList(['🔴', '⭕'], { max: 1 }), /最大1個/);
});

test('serializes guild emoji using Discord mention syntax', () => {
    const emoji = { id: '123456789012345678', name: 'server_red', animated: false };
    const csv = descriptorsToReactionCsv([
        { type: 'unicode', value: '🔴' },
        { type: 'custom', id: emoji.id },
    ], new Map([[emoji.id, emoji]]));
    assert.equal(csv, '🔴,<:server_red:123456789012345678>');
});

test('parses stored settings for the dashboard and rejects deleted guild emoji', () => {
    const guildIds = new Set(['123456789012345678']);
    assert.deepEqual(
        descriptorsForClient('⭕,<:server_red:123456789012345678>', guildIds),
        [
            { type: 'unicode', value: '⭕' },
            { type: 'custom', id: '123456789012345678' },
        ],
    );
    assert.throws(
        () => descriptorsForClient('<:deleted:999999999999999999>', guildIds),
        /利用できないカスタム絵文字/,
    );
});

test('resolves custom reactions to the current guild emoji object', () => {
    const custom = { id: '123456789012345678', name: 'server_red', animated: false };
    const guild = { emojis: { cache: new Map([[custom.id, custom]]) } };
    assert.deepEqual(
        resolveDiscordReactionValues('🔴,<:server_red:123456789012345678>', guild),
        ['🔴', custom],
    );
});
