import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { deliverCalendarGiveawayItem } from '../src/lib/calendarGiveawayDelivery.js';

const testConnectionString = process.env.REACTUS_TEST_DATABASE_URL;
const { Client } = pg;

test('giveaway claim survives a closed DB session and recovers without a duplicate Discord post', {
    skip: !testConnectionString,
}, async () => {
    const dbUrl = new URL(testConnectionString);
    // This test creates an isolated schema and changes claim timestamps.
    // Never connect it to a production or remotely hosted database.
    assert.ok(['localhost', '127.0.0.1'].includes(dbUrl.hostname));
    assert.equal(dbUrl.pathname, '/reactus_test');

    const schema = 'reactus_accept_' + randomUUID().replaceAll('-', '');
    const admin = new Client({ connectionString: testConnectionString });
    const processA = new Client({ connectionString: testConnectionString });
    const processB = new Client({ connectionString: testConnectionString });
    let schemaCreated = false;
    let processAClosed = false;
    const messages = [];

    const channel = {
        id: 'channel-1',
        guildId: 'guild-1',
        client: { user: { id: 'bot-1' } },
        async send(payload) {
            const snowflake = (
                ((BigInt(Date.now()) - 1420070400000n) << 22n)
                + BigInt(messages.length + 1)
            ).toString();
            const message = {
                id: snowflake,
                author: { id: 'bot-1' },
                createdTimestamp: Date.now(),
                embeds: payload.embeds,
            };
            messages.push(message);
            return message;
        },
        messages: {
            async fetch() {
                return new Map(messages.slice().reverse().map(message => [message.id, message]));
            },
        },
    };

    try {
        await admin.connect();
        await admin.query(`CREATE SCHEMA "${schema}"`);
        schemaCreated = true;
        await admin.query(`
            CREATE TABLE "${schema}".calendar_giveaway_posts (
                delivery_id TEXT PRIMARY KEY,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'CLAIMED',
                claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                claim_token UUID NOT NULL,
                message_id TEXT
            )
        `);
        await admin.query(`CREATE TABLE "${schema}".giveaways (message_id TEXT PRIMARY KEY)`);

        await processA.connect();
        await processB.connect();
        await processA.query(`SET search_path TO "${schema}", public`);
        await processB.query(`SET search_path TO "${schema}", public`);

        let interruptBeforePersist = true;
        const args = (pool) => ({
            pool,
            channel,
            notificationKey: 'guild-1:channel-1:calendar-event',
            slot: 'prize:0',
            startTime: new Date(Date.now() - 60_000),
            buildPayload: marker => ({ embeds: [{ footer: { text: marker } }] }),
            onMessage: async message => {
                if (interruptBeforePersist) {
                    throw new Error('process stopped after Discord acknowledged the message');
                }
                await pool.query(
                    'INSERT INTO giveaways (message_id) VALUES ($1) ON CONFLICT DO NOTHING',
                    [message.id],
                );
            },
        });

        await assert.rejects(
            deliverCalendarGiveawayItem(args(processA)),
            /process stopped after Discord acknowledged/,
        );
        assert.equal(messages.length, 1);

        // The first PostgreSQL session ends; a fresh session gets the claim.
        await processA.end();
        processAClosed = true;

        await assert.rejects(
            deliverCalendarGiveawayItem(args(processB)),
            /owned by another active attempt/,
        );
        assert.equal(messages.length, 1);

        // Simulate passage of the existing five-minute recovery timeout.
        await admin.query(`
            UPDATE "${schema}".calendar_giveaway_posts
            SET claimed_at = NOW() - INTERVAL '6 minutes'
        `);
        interruptBeforePersist = false;

        const resumed = await deliverCalendarGiveawayItem(args(processB));
        assert.equal(resumed.recovered, true);
        assert.equal(messages.length, 1, 'The new DB session must reuse the original Discord post');

        const journal = await admin.query(`
            SELECT status, message_id
            FROM "${schema}".calendar_giveaway_posts
        `);
        assert.equal(journal.rows.length, 1);
        assert.equal(journal.rows[0].status, 'POSTED');
        assert.equal(journal.rows[0].message_id, messages[0].id);

        const giveaway = await admin.query(`SELECT message_id FROM "${schema}".giveaways`);
        assert.deepEqual(giveaway.rows.map(row => row.message_id), [messages[0].id]);

        const repeated = await deliverCalendarGiveawayItem(args(processB));
        assert.equal(repeated.skipped, true);
        assert.equal(messages.length, 1);
    } finally {
        if (!processAClosed) await processA.end().catch(() => {});
        await processB.end().catch(() => {});
        if (schemaCreated) {
            await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
        }
        await admin.end().catch(() => {});
    }
});
