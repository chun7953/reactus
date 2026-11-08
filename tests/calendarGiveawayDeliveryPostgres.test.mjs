import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const { Client } = pg;

import { deliverCalendarGiveawayItem } from '../src/lib/calendarGiveawayDelivery.js';

const testConnectionString = process.env.REACTUS_TEST_DATABASE_URL;

test('PostgreSQL claim journal supports restart recovery and UUID fencing', {
    skip: !testConnectionString,
}, async () => {
    const db = new Client({ connectionString: testConnectionString });
    await db.connect();
    let sequence = 0n;
    const messages = [];

    const channel = {
        guildId: 'test-guild',
        id: 'test-channel',
        client: { user: { id: 'test-bot' } },
        async send(payload) {
            sequence += 1n;
            const id = (((BigInt(Date.now()) - 1420070400000n) << 22n) + sequence).toString();
            const message = {
                id,
                author: { id: 'test-bot' },
                createdTimestamp: Date.now(),
                embeds: payload.embeds,
                async edit({ embeds }) { this.embeds = embeds; return this; },
            };
            messages.push(message);
            return message;
        },
        messages: {
            async fetch() {
                return new Map(messages.slice().reverse().map(m => [m.id, m]));
            },
        },
    };

    const options = {
        pool: db,
        channel,
        notificationKey: 'postgres-integration-calendar-event',
        slot: 'prize:0',
        startTime: new Date(Date.now() - 60_000),
        buildPayload: marker => ({ embeds: [{ footer: { text: marker } }] }),
        onPosted: (message, marker) => message.edit({
            embeds: [{ footer: { text: `メッセージID: ${message.id} | ${marker}` } }],
        }),
    };

    try {
        // Temporary table: never modifies production schemas, even if test
        // connection details are misconfigured.
        await db.query(`
            CREATE TEMP TABLE calendar_giveaway_posts (
                delivery_id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'CLAIMED',
                claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                claim_token UUID NOT NULL,
                message_id TEXT
            )
        `);

        let shouldFail = true;
        const firstOptions = {
            ...options,
            onMessage: async () => {
                if (shouldFail) throw new Error('simulated interruption after Discord send');
            },
        };

        await assert.rejects(
            deliverCalendarGiveawayItem(firstOptions),
            /simulated interruption/,
        );
        assert.equal(messages.length, 1);
        const firstClaim = await db.query(
            'SELECT delivery_id, status, claim_token, message_id FROM calendar_giveaway_posts',
        );
        assert.equal(firstClaim.rows[0].status, 'CLAIMED');
        assert.match(firstClaim.rows[0].claim_token, /^[0-9a-f-]{36}$/);
        assert.equal(firstClaim.rows[0].message_id, null);

        // Simulate a stale claim without waiting five real minutes.
        await db.query(
            "UPDATE calendar_giveaway_posts SET claimed_at = NOW() - INTERVAL '6 minutes'",
        );
        shouldFail = false;
        const recovered = await deliverCalendarGiveawayItem(firstOptions);
        assert.equal(recovered.recovered, true);
        assert.equal(messages.length, 1);

        const saved = await db.query(
            'SELECT status, message_id, claim_token FROM calendar_giveaway_posts',
        );
        assert.equal(saved.rows[0].status, 'POSTED');
        assert.equal(saved.rows[0].message_id, messages[0].id);
        assert.notEqual(saved.rows[0].claim_token, firstClaim.rows[0].claim_token);

        const repeated = await deliverCalendarGiveawayItem(firstOptions);
        assert.equal(repeated.skipped, true);
        assert.equal(messages.length, 1);
    } finally {
        await db.end();
    }
});
