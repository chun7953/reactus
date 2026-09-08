import assert from 'node:assert/strict';
import test from 'node:test';

import { applyConfiguredAutoReactions } from '../src/lib/autoReactionService.js';

function fakeMessage({ content = '【予定】本文', reactions = [], customEmojis = [] } = {}) {
    const reacted = [];
    const guildEmojiMap = new Map(customEmojis.map(emoji => [emoji.id, emoji]));
    return {
        guild: {
            id: 'guild-1',
            emojis: { cache: guildEmojiMap },
        },
        channel: { id: 'channel-1' },
        content,
        reactions: {
            cache: {
                some(callback) { return reactions.some(callback); },
            },
        },
        reacted,
        async react(value) { reacted.push(value); },
    };
}

const settings = emojis => async () => [{
    channel_id: 'channel-1',
    trigger: '【予定】',
    emojis,
}];

test('applies Unicode and current guild custom emoji directly', async () => {
    const custom = { id: '123456789012345678', name: 'serveremoji' };
    const message = fakeMessage({ customEmojis: [custom] });

    const result = await applyConfiguredAutoReactions(message, {
        getSettings: settings(`🔴,<:serveremoji:${custom.id}>`),
    });

    assert.deepEqual(result, { matched: true, reacted: 2 });
    assert.equal(message.reacted[0], '🔴');
    assert.equal(message.reacted[1], custom);
});

test('does not send a duplicate reaction already added by this bot', async () => {
    const message = fakeMessage({
        reactions: [{ me: true, emoji: { id: null, name: '✅' } }],
    });

    const result = await applyConfiguredAutoReactions(message, {
        getSettings: settings('✅,🔴'),
    });

    assert.deepEqual(result, { matched: true, reacted: 1 });
    assert.deepEqual(message.reacted, ['🔴']);
});

test('treats removed or foreign custom emoji as invalid and skips the rule safely', async () => {
    const warnings = [];
    const message = fakeMessage();

    const result = await applyConfiguredAutoReactions(message, {
        getSettings: settings('<:gone:123456789012345678>'),
        logger: { warn: value => warnings.push(value), error() {} },
    });

    assert.equal(result.matched, true);
    assert.equal(result.reacted, 0);
    assert.equal(result.invalid, true);
    assert.equal(message.reacted.length, 0);
    assert.equal(warnings.length, 1);
});

test('does nothing when no channel/trigger rule matches', async () => {
    const message = fakeMessage({ content: 'unrelated' });
    const result = await applyConfiguredAutoReactions(message, {
        getSettings: settings('🔴'),
    });

    assert.deepEqual(result, { matched: false, reacted: 0 });
    assert.equal(message.reacted.length, 0);
});
