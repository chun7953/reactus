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
