import assert from 'node:assert/strict';
import test from 'node:test';

import { google } from 'googleapis';

test('upgraded Google APIs preserves Reactus calendar and sheets entrypoints', () => {
    assert.equal(typeof google.auth.GoogleAuth, 'function');

    // Construct SDK resources only; never contact a real Google account.
    const calendar = google.calendar({ version: 'v3' });
    const sheets = google.sheets({ version: 'v4' });

    for (const name of ['list', 'get', 'insert', 'update', 'patch', 'delete']) {
        assert.equal(typeof calendar.events[name], 'function', `calendar.events.${name}`);
    }
    assert.equal(typeof calendar.calendars.get, 'function');
    assert.equal(typeof sheets.spreadsheets.get, 'function');
    assert.equal(typeof sheets.spreadsheets.values.get, 'function');
    assert.equal(typeof sheets.spreadsheets.values.update, 'function');
    assert.equal(typeof sheets.spreadsheets.values.append, 'function');

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: 'ci@example.test',
            private_key: 'not-a-real-private-key',
        },
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    assert.equal(typeof auth.getClient, 'function');
});

test('Google Calendar list request is generated without a live provider call', async () => {
    const calls = [];
    const auth = {
        async request(options) {
            calls.push(options);
            return { data: { items: [] }, status: 200 };
        },
    };
    const calendar = google.calendar({ version: 'v3', auth });
    const result = await calendar.events.list({
        calendarId: 'ci@example.test',
        timeMin: '2026-11-08T00:00:00Z',
        singleEvents: true,
        maxResults: 10,
    });

    assert.deepEqual(result.data.items, []);
    assert.equal(calls.length, 1);
    assert.match(String(calls[0].url), /calendar\/v3\/calendars\/ci%40example\.test\/events/);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].params.singleEvents, true);
});

test('Google Calendar create, patch, update and delete prepare correct requests without writing live data', async () => {
    const calls = [];
    const auth = {
        async request(options) {
            calls.push(options);
            return { status: 200, data: { id: 'mock-event-id' } };
        },
    };
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = 'acceptance@example.test';
    const eventId = 'mock-event-id';
    const payload = {
        summary: 'Reactus test-only event',
        start: { dateTime: '2026-11-10T10:00:00+09:00', timeZone: 'Asia/Tokyo' },
        end: { dateTime: '2026-11-10T10:30:00+09:00', timeZone: 'Asia/Tokyo' },
        extendedProperties: { private: { reactusType: 'post' } },
    };

    await calendar.events.insert({ calendarId, requestBody: payload });
    await calendar.events.patch({
        calendarId, eventId,
        requestBody: { summary: 'Reactus test-only updated title' },
    });
    await calendar.events.update({ calendarId, eventId, requestBody: payload });
    await calendar.events.delete({ calendarId, eventId });

    assert.deepEqual(calls.map(call => call.method), ['POST', 'PATCH', 'PUT', 'DELETE']);
    assert.equal(calls.length, 4);
    for (const call of calls) {
        assert.match(String(call.url), /\/calendar\/v3\/calendars\/acceptance%40example\.test\/events/);
    }
    for (const call of calls.slice(1)) {
        assert.match(String(call.url), /\/mock-event-id$/);
    }
    assert.deepEqual(calls[0].data, payload);
    assert.equal(calls[1].data.summary, 'Reactus test-only updated title');
    assert.deepEqual(calls[2].data, payload);
    assert.equal(calls[3].data, undefined);
    // auth.request is an in-memory stub: nothing was sent to Google.
});
