import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyMentionPrivateProperties,
    decodeMentionTargets,
    encodeMentionTargets,
    eventMentionTokens,
    extractDiscordMentions,
    mentionConfigFromPrivate,
    mentionPrivateProperties,
    normalizeMentionConfig,
} from '../src/lib/calendarMentions.js';

test('legacy single-role payload upgrades to custom targets', () => {
    assert.deepEqual(normalizeMentionConfig({ mode:'role', roleId:'123456789012345678' }), {
        mode: 'custom',
        targets: [{ type:'role', id:'123456789012345678' }],
    });
});

test('mixed rich mention targets are deduplicated and encoded', () => {
    const config = normalizeMentionConfig({
        mode: 'custom',
        targets: [
            { type:'role', id:'111111111111111111' },
            { type:'user', id:'222222222222222222' },
            { type:'everyone' },
            { type:'here' },
            { type:'role', id:'111111111111111111' },
        ],
    });
    assert.deepEqual(config.targets, [
        { type:'role', id:'111111111111111111' },
        { type:'user', id:'222222222222222222' },
        { type:'everyone' },
        { type:'here' },
    ]);
    const encoded = encodeMentionTargets(config.targets);
    assert.equal(encoded, 'r:111111111111111111,u:222222222222222222,everyone,here');
    assert.deepEqual(decodeMentionTargets(encoded), config.targets);
});

test('custom mention metadata suppresses the monitor default role', () => {
    const properties = mentionPrivateProperties({
        mode:'custom',
        targets:[{ type:'user', id:'222222222222222222' }, { type:'everyone' }],
    });
    assert.equal(properties.reactusMentionMode, 'none');
    assert.equal(properties.reactusMentionTargets, 'u:222222222222222222,everyone');
    assert.deepEqual(mentionConfigFromPrivate(properties), {
        mode:'custom',
        targets:[{ type:'user', id:'222222222222222222' }, { type:'everyone' }],
    });
    assert.deepEqual(eventMentionTokens(properties, '999999999999999999'), [
        '<@222222222222222222>',
        '@everyone',
    ]);
});

test('old stored role metadata is still readable', () => {
    assert.deepEqual(mentionConfigFromPrivate({
        reactusMentionMode:'role',
        reactusMentionRoleId:'333333333333333333',
    }), {
        mode:'custom',
        targets:[{ type:'role', id:'333333333333333333' }],
    });
});

test('switching back to none removes stale custom target metadata', () => {
    const next = applyMentionPrivateProperties({
        reactusMentionMode:'none',
        reactusMentionTargets:'r:111111111111111111',
        reactusMentionRoleId:'444444444444444444',
        reactusAssetId:'asset-1',
    }, { mode:'none' });
    assert.deepEqual(next, {
        reactusMentionMode:'none',
        reactusAssetId:'asset-1',
    });
});

test('direct Discord mentions can still be extracted from hand-written calendar text', () => {
    assert.deepEqual(extractDiscordMentions('本文\n<@&111111111111111111> <@222222222222222222> @everyone @here'), {
        cleaned:'本文',
        mentions:[
            '<@&111111111111111111>',
            '<@222222222222222222>',
            '@everyone',
            '@here',
        ],
    });
});

test('custom mentions reject empty and oversized target lists', () => {
    assert.throws(() => normalizeMentionConfig({ mode:'custom', targets:[] }), /1つ以上/);
    const targets = Array.from({ length:21 }, (_, index) => ({
        type:'user', id:String(100000000000000000n + BigInt(index)),
    }));
    assert.throws(() => normalizeMentionConfig({ mode:'custom', targets }), /最大20件/);
});
