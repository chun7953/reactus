import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    CalendarClaimChallengeError,
    CalendarClaimRequiredError,
    ensureCalendarClaim,
    revokeCalendarClaimsForGuild,
} from '../src/lib/calendarClaimService.js';

const settingsCachePath = new URL('../src/lib/settingsCache.js', import.meta.url);
const guildDeletePath = new URL('../src/events/guildDelete.js', import.meta.url);

function createClaimDb() {
    const claims = new Map();
    const key = (guildId, calendarId) => `${guildId}\u0000${calendarId}`;

    return {
        claims,
        async query(sql, params = []) {
            const source = String(sql);

            if (source.includes('FROM calendar_claims') && source.includes('WHERE guild_id = $1 AND calendar_id = $2')) {
                const claim = claims.get(key(params[0], params[1]));
                return { rows: claim ? [{ ...claim }] : [], rowCount: claim ? 1 : 0 };
            }

            if (source.includes('UPDATE calendar_claims') && source.includes("verification_method = 'calendar_description'")) {
                const claimKey = key(params[0], params[1]);
                const claim = claims.get(claimKey);
                if (!claim || claim.challenge_token !== params[3]) return { rows: [], rowCount: 0 };
                claim.verified_at = params[2];
                claim.verification_method = 'calendar_description';
                claim.challenge_token = null;
                claim.challenge_expires_at = null;
                claims.set(claimKey, claim);
                return { rows: [{ verified_at: claim.verified_at }], rowCount: 1 };
            }

            if (source.includes('INSERT INTO calendar_claims')) {
                claims.set(key(params[0], params[1]), {
                    guild_id: params[0],
                    calendar_id: params[1],
                    verified_at: null,
                    verification_method: null,
                    challenge_token: params[2],
                    challenge_expires_at: params[3],
                });
                return { rows: [], rowCount: 1 };
            }

            if (source.includes('DELETE FROM calendar_claims WHERE guild_id = $1')) {
                let removed = 0;
                for (const [claimKey, claim] of claims.entries()) {
                    if (claim.guild_id !== params[0]) continue;
                    claims.delete(claimKey);
                    removed += 1;
                }
                return { rows: [], rowCount: removed };
            }

            throw new Error(`Unexpected query: ${source}`);
        },
    };
}

test('guild leave requires a fresh calendar ownership challenge before the same calendar can be trusted again', async () => {
    const db = createClaimDb();
    const guildId = 'fresh-guild';
    const calendarId = 'fresh-calendar@example.com';
    let description = '';
    let now = new Date('2026-09-12T00:00:00Z');
    const calendar = {
        calendars: {
            async get({ calendarId: requested }) {
                assert.equal(requested, calendarId);
                return { data: { description } };
            },
        },
    };

    await assert.rejects(
        ensureCalendarClaim(guildId, calendarId, {
            allowChallenge: true,
            db,
            calendar,
            now: () => now,
            tokenFactory: () => 'first-token',
        }),
        error => error instanceof CalendarClaimChallengeError
            && error.challengeCode === 'REACTUS-VERIFY-first-token',
    );

    description = 'Fresh tenant proof\nREACTUS-VERIFY-first-token';
    now = new Date('2026-09-12T00:05:00Z');
    const firstVerification = await ensureCalendarClaim(guildId, calendarId, {
        allowChallenge: true,
        db,
        calendar,
        now: () => now,
    });
    assert.equal(firstVerification.newlyVerified, true);

    assert.equal(await revokeCalendarClaimsForGuild(guildId, { db }), 1);
    assert.equal(db.claims.size, 0);

    await assert.rejects(
        ensureCalendarClaim(guildId, calendarId, { db }),
        error => error instanceof CalendarClaimRequiredError && error.statusCode === 403,
    );

    description = '';
    now = new Date('2026-09-12T01:00:00Z');
    await assert.rejects(
        ensureCalendarClaim(guildId, calendarId, {
            allowChallenge: true,
            db,
            calendar,
            now: () => now,
            tokenFactory: () => 'second-token',
        }),
        error => error instanceof CalendarClaimChallengeError
            && error.challengeCode === 'REACTUS-VERIFY-second-token'
            && error.challengeCode !== 'REACTUS-VERIFY-first-token',
    );

    description = 'Rejoin proof\nREACTUS-VERIFY-second-token';
    now = new Date('2026-09-12T01:05:00Z');
    const secondVerification = await ensureCalendarClaim(guildId, calendarId, {
        allowChallenge: true,
        db,
        calendar,
        now: () => now,
    });
    assert.equal(secondVerification.newlyVerified, true);
});

test('runtime calendar reads remain claim-gated and guild departure owns claim revocation', async () => {
    const [settingsSource, guildDeleteSource] = await Promise.all([
        readFile(settingsCachePath, 'utf8'),
        readFile(guildDeletePath, 'utf8'),
    ]);

    assert.match(settingsSource, /FROM calendar_monitors cm[\s\S]*INNER JOIN calendar_claims cc[\s\S]*cc\.verified_at IS NOT NULL/);
    assert.match(settingsSource, /CASE[\s\S]*gc\.main_calendar_id IS NULL OR cc\.verified_at IS NOT NULL[\s\S]*ELSE NULL[\s\S]*END AS main_calendar_id/);
    assert.match(guildDeleteSource, /revokeCalendarClaimsForGuild\(guild\.id\)/);
});
