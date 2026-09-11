import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { revokeWebAdminAuthForGuild } from '../src/lib/webAdminAuth.js';

const guildDeletePath = new URL('../src/events/guildDelete.js', import.meta.url);
const authPath = new URL('../src/lib/webAdminAuth.js', import.meta.url);

test('guild-wide web admin revocation deletes only scoped login credentials', async () => {
    const queries = [];
    const db = {
        async query(sql, values) {
            queries.push({ sql: String(sql), values });
            return {
                rows: [{ login_tokens: 2, sessions: 3 }],
                rowCount: 1,
            };
        },
    };

    const result = await revokeWebAdminAuthForGuild('guild-1', { db });

    assert.deepEqual(result, { loginTokens: 2, sessions: 3 });
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].values, ['guild-1']);
    assert.match(queries[0].sql, /DELETE FROM web_admin_login_tokens\s+WHERE guild_id = \$1/);
    assert.match(queries[0].sql, /DELETE FROM web_admin_sessions\s+WHERE guild_id = \$1/);
    assert.doesNotMatch(queries[0].sql, /DELETE FROM (reactions|announcements|calendar_monitors|guild_configs|giveaways|scheduled_giveaways|calendar_post_assets)/);
});

test('guild-wide web admin revocation requires an explicit guild id', async () => {
    await assert.rejects(
        () => revokeWebAdminAuthForGuild('', { db: { query: async () => ({ rows: [] }) } }),
        /guildId is required/,
    );
});

test('guild departure independently revokes calendar claims and web admin credentials', async () => {
    const [guildDeleteSource, authSource] = await Promise.all([
        readFile(guildDeletePath, 'utf8'),
        readFile(authPath, 'utf8'),
    ]);

    assert.match(guildDeleteSource, /revokeCalendarClaimsForGuild\(guild\.id\)/);
    assert.match(guildDeleteSource, /revokeWebAdminAuthForGuild\(guild\.id\)/);
    assert.match(guildDeleteSource, /Promise\.allSettled/);
    assert.doesNotMatch(guildDeleteSource, /DELETE FROM/);

    assert.match(authSource, /clearGuildSessionCache\(scopedGuildId\);[\s\S]*await db\.query[\s\S]*clearGuildSessionCache\(scopedGuildId\);/);
    assert.doesNotMatch(authSource, /DELETE FROM (reactions|announcements|calendar_monitors|guild_configs|giveaways|scheduled_giveaways|calendar_post_assets)/);
});
