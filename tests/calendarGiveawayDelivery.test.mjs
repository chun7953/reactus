import assert from 'node:assert/strict';
import test from 'node:test';

import {
    calendarGiveawayDeliveryId,
    calendarGiveawayMarker,
    deliverCalendarGiveawayItem,
    findExistingCalendarGiveawayMessage,
} from '../src/lib/calendarGiveawayDelivery.js';

const EPOCH = 1420070400000;
const startTime = new Date('2026-11-06T12:00:00Z');
let snowflakeSequence = 0n;

function newSnowflake(timestamp = Date.now()) {
    snowflakeSequence += 1n;
    return (((BigInt(timestamp) - BigInt(EPOCH)) << 22n) + snowflakeSequence).toString();
}

function fakePool() {
    const claims = new Map();
    const state = { now: Date.now(), claims, recordedGiveaways: new Set(), failGiveawayInsert: false };
    return {
        state,
        async query(sql, params) {
            const key = params?.[0];
            if (sql.includes('INSERT INTO calendar_giveaway_posts')) {
                if (claims.has(key)) return { rows: [], rowCount: 0 };
                const claimed_at = new Date(state.now);
                const claim_token = params[3];
                claims.set(key, { status: 'CLAIMED', message_id: null, claimed_at, claim_token });
                return { rows: [{ claim_token }], rowCount: 1 };
            }
            if (sql.includes('UPDATE calendar_giveaway_posts') && sql.includes('SET claimed_at')) {
                const claim = claims.get(key);
                if (!claim || claim.status !== 'CLAIMED' || state.now - claim.claimed_at.getTime() < 300_000) {
                    return { rows: [], rowCount: 0 };
                }
                claim.claimed_at = new Date(state.now);
                claim.claim_token = params[3];
                return { rows: [{ claim_token: claim.claim_token }], rowCount: 1 };
            }
            if (sql.includes('SELECT status, message_id FROM calendar_giveaway_posts')) {
                const claim = claims.get(key);
                return { rows: claim ? [claim] : [], rowCount: claim ? 1 : 0 };
            }
            if (sql.includes("SET status = 'POSTED'")) {
                const claim = claims.get(key);
                if (!claim || claim.status !== 'CLAIMED' || claim.claim_token !== params[2]) {
                    return { rows: [], rowCount: 0 };
                }
                claim.status = 'POSTED';
                claim.message_id = params[1];
                return { rows: [{ message_id: params[1] }], rowCount: 1 };
            }
            if (sql.includes('INSERT INTO giveaways')) {
                if (state.failGiveawayInsert) throw new Error('database interrupted after Discord send');
                state.recordedGiveaways.add(params[0]);
                return { rowCount: 1, rows: [] };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        },
    };
}

function fakeChannel() {
    const sent = [];
    const state = { sendGate: null, failFetch: false };
    const channel = {
        guildId: 'guild-1',
        id: 'channel-1',
        client: { user: { id: 'bot-1' } },
        state, sent,
        async send(payload) {
            if (state.sendGate) await state.sendGate;
            const message = {
                id: newSnowflake(),
                author: { id: 'bot-1' },
                createdTimestamp: Date.now(),
                embeds: payload.embeds,
                nonce: payload.nonce,
                enforceNonce: payload.enforceNonce,
                async edit(updated) {
                    message.embeds = updated.embeds;
                    return message;
                },
            };
            sent.push(message);
            return message;
        },
        messages: {
            async fetch({ limit, before } = {}) {
                if (state.failFetch) throw new Error('Discord history unavailable');
                const filtered = sent.filter(m => !before || BigInt(m.id) < BigInt(before));
                filtered.sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1);
                return new Map(filtered.slice(0, limit || 100).map(m => [m.id, m]));
            },
        },
    };
    return channel;
}

function options(pool, channel, slot = 'prize:0', overrides = {}) {
    return {
        pool,
        channel,
        notificationKey: 'calendar:guild-1:channel-1:event-20261106',
        slot,
        startTime,
        buildPayload: marker => ({ embeds: [{ footer: { text: marker }, description: '抽選テスト' }] }),
        onMessage: message => pool.query('INSERT INTO giveaways', [message.id]),
        onPosted: async (message, marker) => message.edit({
            embeds: [{ footer: { text: `メッセージID: ${message.id} | ${marker}` } }],
        }),
        ...overrides,
    };
}

test('one logical prize posts only once across monitor runs', async () => {
    const pool = fakePool();
    const channel = fakeChannel();
    const args = options(pool, channel);

    const first = await deliverCalendarGiveawayItem(args);
    const second = await deliverCalendarGiveawayItem(args);
    assert.equal(first.skipped, false);
    assert.equal(second.skipped, true);
    assert.equal(second.messageId, first.messageId);
    assert.equal(channel.sent.length, 1);
    assert.equal(pool.state.recordedGiveaways.size, 1);
    assert.equal(channel.sent[0].enforceNonce, true);
    assert.equal(channel.sent[0].nonce.length, 24);
    assert.match(channel.sent[0].embeds[0].footer.text, /Reactus投稿:/);
});

test('concurrent monitor attempts cannot both send a claimed prize', async () => {
    const pool = fakePool();
    const channel = fakeChannel();
    let unblock;
    channel.state.sendGate = new Promise(resolve => { unblock = resolve; });

    const pending = deliverCalendarGiveawayItem(options(pool, channel));
    // Wait for the first claim and pending send.
    while (!pool.state.claims.size) await new Promise(resolve => setImmediate(resolve));

    await assert.rejects(
        deliverCalendarGiveawayItem(options(pool, channel)),
        /owned by another active attempt/,
    );
    unblock();
    await pending;
    assert.equal(channel.sent.length, 1);
});

test('recovery after a crash following Discord send reuses the posted message', async () => {
    const pool = fakePool();
    const channel = fakeChannel();
    pool.state.failGiveawayInsert = true;

    await assert.rejects(deliverCalendarGiveawayItem(options(pool, channel)), /database interrupted/);
    assert.equal(channel.sent.length, 1);
    assert.equal(pool.state.claims.size, 1);

    pool.state.failGiveawayInsert = false;
    pool.state.now += 301_000;
    const recovered = await deliverCalendarGiveawayItem(options(pool, channel));
    assert.equal(recovered.recovered, true);
    assert.equal(channel.sent.length, 1);
    assert.equal(pool.state.recordedGiveaways.size, 1);
    assert.equal([...pool.state.claims.values()][0].status, 'POSTED');
});

test('partial batch preserves its first posted prize on restart', async () => {
    const pool = fakePool();
    const channel = fakeChannel();
    await deliverCalendarGiveawayItem(options(pool, channel, 'prize:0'));
    pool.state.failGiveawayInsert = true;
    await assert.rejects(deliverCalendarGiveawayItem(options(pool, channel, 'prize:1')));
    pool.state.failGiveawayInsert = false;
    pool.state.now += 301_000;

    const first = await deliverCalendarGiveawayItem(options(pool, channel, 'prize:0'));
    const second = await deliverCalendarGiveawayItem(options(pool, channel, 'prize:1'));
    assert.equal(first.skipped, true);
    assert.equal(second.recovered, true);
    assert.equal(channel.sent.length, 2);
});

test('recovery fails closed when Discord history is inaccessible', async () => {
    const pool = fakePool();
    const channel = fakeChannel();
    pool.state.failGiveawayInsert = true;
    await assert.rejects(deliverCalendarGiveawayItem(options(pool, channel)));
    pool.state.now += 301_000;
    channel.state.failFetch = true;

    await assert.rejects(deliverCalendarGiveawayItem(options(pool, channel)), /history unavailable/);
    assert.equal(channel.sent.length, 1);
    assert.equal([...pool.state.claims.values()][0].status, 'CLAIMED');
});

test('a completed claim is not replayed after presentation update fails', async () => {
    const pool = fakePool();
    const channel = fakeChannel();
    const logger = { warn() {} };
    const args = options(pool, channel, 'prize:0', {
        logger,
        onPosted() { throw new Error('Discord edit failed'); },
    });
    const first = await deliverCalendarGiveawayItem(args);
    const second = await deliverCalendarGiveawayItem(args);
    assert.equal(first.skipped, false);
    assert.equal(second.skipped, true);
    assert.equal(channel.sent.length, 1);
});

test('recovery marker is stable per item but differs between prizes', async () => {
    const id1 = calendarGiveawayDeliveryId('calendar-event', 'prize:0');
    const id2 = calendarGiveawayDeliveryId('calendar-event', 'prize:1');
    assert.notEqual(id1, id2);
    assert.equal(id1, calendarGiveawayDeliveryId('calendar-event', 'prize:0'));
    assert.match(calendarGiveawayMarker(id1), new RegExp(id1));
});

test('history lookup does not mistake another prize for the claimed one', async () => {
    const channel = fakeChannel();
    await channel.send({ embeds: [{ footer: { text: calendarGiveawayMarker('other-delivery') } }] });
    assert.equal(await findExistingCalendarGiveawayMessage(channel, 'wanted-delivery', startTime), null);
});

test('stale claim token cannot finalize a delivery after another worker takes ownership', async () => {
    const pool = fakePool();
    const id = 'delivery-fence-test';
    const firstToken = '11111111-1111-4111-8111-111111111111';
    const secondToken = '22222222-2222-4222-8222-222222222222';

    const first = await pool.query(
        'INSERT INTO calendar_giveaway_posts', [id, 'guild-1', 'channel-1', firstToken],
    );
    assert.equal(first.rows[0].claim_token, firstToken);

    pool.state.now += 301_000;
    const second = await pool.query(
        'UPDATE calendar_giveaway_posts SET claimed_at', [id, 'guild-1', 'channel-1', secondToken],
    );
    assert.equal(second.rows[0].claim_token, secondToken);

    const stale = await pool.query(
        "UPDATE calendar_giveaway_posts SET status = 'POSTED'",
        [id, 'old-message', firstToken],
    );
    assert.equal(stale.rowCount, 0);

    const fresh = await pool.query(
        "UPDATE calendar_giveaway_posts SET status = 'POSTED'",
        [id, 'new-message', secondToken],
    );
    assert.equal(fresh.rowCount, 1);
});
