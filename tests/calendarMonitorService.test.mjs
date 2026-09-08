import assert from 'node:assert/strict';
import test from 'node:test';

import {
    cleanTrigger,
    normalizeMonitorPayload,
} from '../src/lib/webCalendarMonitorService.js';

function fakeGuild() {
    const channels = new Map([
        ['111111111111111111', {
            id: '111111111111111111',
            isTextBased: () => true,
            isDMBased: () => false,
        }],
        ['222222222222222222', {
            id: '222222222222222222',
            isTextBased: () => true,
            isDMBased: () => true,
        }],
    ]);
    const roles = new Map([
        ['333333333333333333', { id: '333333333333333333', name: 'Events' }],
        ['999999999999999999', { id: '999999999999999999', name: '@everyone' }],
    ]);
    return {
        id: '999999999999999999',
        channels: { cache: channels },
        roles: { cache: roles },
    };
}

test('cleanTrigger removes Reactus brackets and line breaks', () => {
    assert.equal(cleanTrigger(' 【ラキショ】\n '), 'ラキショ');
    assert.equal(cleanTrigger('【ご連絡】'), 'ご連絡');
});

test('normalizeMonitorPayload accepts a guild text channel and optional role', () => {
    const value = normalizeMonitorPayload({
        channelId: '111111111111111111',
        calendarId: 'calendar@example.com',
        triggerKeyword: '【ラキショ】',
        mentionRoleId: '333333333333333333',
    }, fakeGuild());

    assert.deepEqual(value, {
        channelId: '111111111111111111',
        calendarId: 'calendar@example.com',
        triggerKeyword: 'ラキショ',
        mentionRoleId: '333333333333333333',
    });
});

test('normalizeMonitorPayload rejects DM channels and the everyone role', () => {
    assert.throws(() => normalizeMonitorPayload({
        channelId: '222222222222222222',
        calendarId: 'calendar@example.com',
        triggerKeyword: '通知',
    }, fakeGuild()), /テキストチャンネル/);

    assert.throws(() => normalizeMonitorPayload({
        channelId: '111111111111111111',
        calendarId: 'calendar@example.com',
        triggerKeyword: '通知',
        mentionRoleId: '999999999999999999',
    }, fakeGuild()), /このサーバーのロール/);
});

test('normalizeMonitorPayload rejects missing and oversized trigger keywords', () => {
    assert.throws(() => normalizeMonitorPayload({
        channelId: '111111111111111111',
        calendarId: 'calendar@example.com',
        triggerKeyword: '【】',
    }, fakeGuild()), /トリガーキーワード/);

    assert.throws(() => normalizeMonitorPayload({
        channelId: '111111111111111111',
        calendarId: 'calendar@example.com',
        triggerKeyword: 'あ'.repeat(101),
    }, fakeGuild()), /100文字以内/);
});
