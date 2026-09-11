import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    getWebAdminSession,
    revokeWebAdminAuthForGuild,
} from '../src/lib/webAdminAuth.js';

const guildDeletePath = new URL('../src/events/guildDelete.js', import.meta.url);
const authPath = new URL('../src/lib/webAdminAuth.js', import.meta.url);

function deferred() {
    let resolve;
    const promise = new Promise((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

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

test('session read overlapping completed guild revocation re-reads deleted state instead of recaching stale data', async () => {
    const firstSelectStarted = deferred();
    const releaseFirstSelect = deferred();
    const staleSession = {
        guild_id: 'guild-race-completed',
        user_id: 'user-1',
        expires_at: new Date(Date.now() + 60_000),
    };
    let selectCalls = 0;
    let deleted = false;

    const db = {
        async query(sql) {
            const source = String(sql);
            if (source.includes('SELECT guild_id, user_id, expires_at')) {
                selectCalls += 1;
                if (selectCalls === 1) {
                    firstSelectStarted.resolve();
                    await releaseFirstSelect.promise;
                    return { rows: [staleSession], rowCount: 1 };
                }
                return { rows: deleted ? [] : [staleSession], rowCount: deleted ? 0 : 1 };
            }
            if (source.includes('deleted_login_tokens') && source.includes('deleted_sessions')) {
                deleted = true;
                return { rows: [{ login_tokens: 0, sessions: 1 }], rowCount: 1 };
            }
            throw new Error(`Unexpected query: ${source}`);
        },
    };

    const sessionPromise = getWebAdminSession('race-token-completed', { db });
    await firstSelectStarted.promise;
    await revokeWebAdminAuthForGuild(staleSession.guild_id, { db });
    releaseFirstSelect.resolve();

    assert.equal(await sessionPromise, null);
    assert.equal(selectCalls, 2);
});

test('session read during active guild revocation fails closed even before delete finishes', async () => {
    const deleteStarted = deferred();
    const releaseDelete = deferred();
    const staleSession = {
        guild_id: 'guild-race-active',
        user_id: 'user-2',
        expires_at: new Date(Date.now() + 60_000),
    };

    const db = {
        async query(sql) {
            const source = String(sql);
            if (source.includes('deleted_login_tokens') && source.includes('deleted_sessions')) {
                deleteStarted.resolve();
                await releaseDelete.promise;
                return { rows: [{ login_tokens: 1, sessions: 1 }], rowCount: 1 };
            }
            if (source.includes('SELECT guild_id, user_id, expires_at')) {
                return { rows: [staleSession], rowCount: 1 };
            }
            throw new Error(`Unexpected query: ${source}`);
        },
    };

    const revokePromise = revokeWebAdminAuthForGuild(staleSession.guild_id, { db });
    await deleteStarted.promise;
    assert.equal(await getWebAdminSession('race-token-active', { db }), null);
    releaseDelete.resolve();
    assert.deepEqual(await revokePromise, { loginTokens: 1, sessions: 1 });
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

    assert.match(authSource, /revokingGuilds\.add\(scopedGuildId\)/);
    assert.match(authSource, /authRevocationRevision \+= 1/);
    assert.match(authSource, /observedRevision !== authRevocationRevision/);
    assert.match(authSource, /selectWebAdminSession\(db, sessionHash\)/);
    assert.doesNotMatch(authSource, /DELETE FROM (reactions|announcements|calendar_monitors|guild_configs|giveaways|scheduled_giveaways|calendar_post_assets)/);
});
