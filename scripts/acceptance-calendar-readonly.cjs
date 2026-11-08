'use strict';

// Ephemeral production read-only acceptance probe. Never prints secrets,
// calendar IDs, event titles, or event bodies, and never writes to providers.
const { google } = require('googleapis');
const { Client } = require('pg');

async function main() {
    if (process.env.FLY_APP_NAME !== 'reactus') {
        throw new Error('Unexpected Fly application');
    }
    const raw = process.env.GOOGLE_SHEETS_CREDENTIALS;
    if (!raw || !process.env.DATABASE_URL) {
        throw new Error('Missing application connection configuration');
    }
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Invalid Google service account configuration');
    }

    const db = new Client({
        connectionString: process.env.DATABASE_URL,
        application_name: 'reactus-readonly-acceptance',
    });
    let ids;
    try {
        await db.connect();
        await db.query('BEGIN TRANSACTION READ ONLY');
        const result = await db.query(
            'SELECT DISTINCT calendar_id FROM public.calendar_monitors WHERE calendar_id IS NOT NULL ORDER BY calendar_id',
        );
        ids = result.rows.map(row => row.calendar_id);
        await db.query('COMMIT');
    } finally {
        await db.end().catch(() => {});
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: parsed.client_email,
            private_key: parsed.private_key,
        },
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/calendar.calendars.readonly',
            'https://www.googleapis.com/auth/calendar.events',
        ],
    });
    const calendar = google.calendar({ version: 'v3', auth: await auth.getClient() });
    const now = Date.now();
    const timeMin = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now + 48 * 60 * 60 * 1000).toISOString();
    const results = [];

    for (const calendarId of ids) {
        try {
            const response = await calendar.events.list({
                calendarId,
                timeMin,
                timeMax,
                maxResults: 1,
                singleEvents: true,
                timeZone: 'Asia/Tokyo',
            }, { timeout: 12000 });
            results.push({ pass: response.status === 200, code: response.status });
        } catch (error) {
            const code = Number(error?.response?.status || error?.code);
            results.push({ pass: false, code: Number.isInteger(code) ? code : 'unknown' });
        }
    }

    const failures = results.filter(result => !result.pass);
    console.log('REACTUS_READ_ONLY_CALENDAR_PROBE', JSON.stringify({
        monitoredCalendars: ids.length,
        successfulReads: results.length - failures.length,
        failedReads: failures.length,
        failureCodes: failures.map(result => result.code),
    }));
    if (ids.length === 0 || failures.length > 0) process.exitCode = 2;
}

main().catch(error => {
    // Never log the Google auth or DB exception body, which could include PII.
    console.error('REACTUS_READ_ONLY_CALENDAR_PROBE_FATAL', String(error?.code || error?.name || 'unknown'));
    process.exitCode = 1;
});
