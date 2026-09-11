import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CalendarClaimChallengeError,
    CalendarClaimRequiredError,
    ensureCalendarClaim,
    unverifiedCalendarIds,
} from '../src/lib/calendarClaimService.js';

function sequenceDb(responses) {
    const queries = [];
    return {
        queries,
        async query(sql, params) {
            queries.push({ sql: String(sql), params });
            const next = responses.shift();
            if (!next) throw new Error(`Unexpected query: ${sql}`);
            return typeof next === 'function' ? next(sql, params) : next;
        },
    };
}

test('verified guild calendar claim returns without touching Google Calendar', async () => {
    const db = sequenceDb([{
        rows: [{
            guild_id: 'guild-1',
            calendar_id: 'calendar@example.com',
            verified_at: new Date('2026-09-12T00:00:00Z'),
            verification_method: 'calendar_description',
            challenge_token: null,
            challenge_expires_at: null,
        }],
        rowCount: 1,
    }]);
    let calendarCalls = 0;

    const result = await ensureCalendarClaim('guild-1', 'calendar@example.com', {
        db,
        calendar: { calendars: { async get() { calendarCalls += 1; } } },
    });

    assert.deepEqual(result, {
        calendarId: 'calendar@example.com',
        verified: true,
        newlyVerified: false,
        method: 'calendar_description',
    });
    assert.equal(calendarCalls, 0);
});

test('unverified calendar fails closed when caller cannot start a claim', async () => {
    const db = sequenceDb([{ rows: [], rowCount: 0 }]);
    await assert.rejects(
        ensureCalendarClaim('guild-1', 'calendar@example.com', { db }),
        error => error instanceof CalendarClaimRequiredError && error.statusCode === 403,
    );
});

test('administrator claim issues a short-lived description challenge', async () => {
    const db = sequenceDb([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 1 },
    ]);
    const calendar = {
        calendars: {
            async get({ calendarId }) {
                assert.equal(calendarId, 'calendar@example.com');
                return { data: { description: 'Existing calendar description' } };
            },
        },
    };

    await assert.rejects(
        ensureCalendarClaim('guild-1', 'calendar@example.com', {
            allowChallenge: true,
            db,
            calendar,
            now: () => new Date('2026-09-12T00:00:00Z'),
            tokenFactory: () => 'fixed-token',
        }),
        error => (
            error instanceof CalendarClaimChallengeError
            && error.statusCode === 409
            && error.challengeCode === 'REACTUS-VERIFY-fixed-token'
            && error.message.includes('説明')
        ),
    );
    assert.match(db.queries[1].sql, /INSERT INTO calendar_claims/);
    assert.equal(db.queries[1].params[2], 'fixed-token');
    assert.equal(db.queries[1].params[3].toISOString(), '2026-09-12T00:15:00.000Z');
});

test('matching description challenge verifies only the requesting guild claim', async () => {
    const db = sequenceDb([
        {
            rows: [{
                guild_id: 'guild-1',
                calendar_id: 'calendar@example.com',
                verified_at: null,
                verification_method: null,
                challenge_token: 'fixed-token',
                challenge_expires_at: new Date('2026-09-12T00:15:00Z'),
            }],
            rowCount: 1,
        },
        { rows: [{ verified_at: new Date('2026-09-12T00:05:00Z') }], rowCount: 1 },
    ]);
    const calendar = {
        calendars: {
            async get() {
                return { data: { description: 'Notes\nREACTUS-VERIFY-fixed-token\nMore notes' } };
            },
        },
    };

    const result = await ensureCalendarClaim('guild-1', 'calendar@example.com', {
        allowChallenge: true,
        db,
        calendar,
        now: () => new Date('2026-09-12T00:05:00Z'),
    });

    assert.deepEqual(result, {
        calendarId: 'calendar@example.com',
        verified: true,
        newlyVerified: true,
        method: 'calendar_description',
    });
    assert.match(db.queries[1].sql, /verification_method = 'calendar_description'/);
    assert.deepEqual(db.queries[1].params.slice(0, 2), ['guild-1', 'calendar@example.com']);
});

test('restore helper reports only calendars without verified claims', async () => {
    const db = sequenceDb([{
        rows: [{ calendar_id: 'verified@example.com' }],
        rowCount: 1,
    }]);

    const result = await unverifiedCalendarIds(db, 'guild-1', [
        'verified@example.com',
        'missing@example.com',
        'verified@example.com',
    ]);

    assert.deepEqual(result, ['missing@example.com']);
    assert.deepEqual(db.queries[0].params, [
        'guild-1',
        ['verified@example.com', 'missing@example.com'],
    ]);
});