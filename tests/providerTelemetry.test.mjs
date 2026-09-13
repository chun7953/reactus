import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createProviderTelemetry } from '../src/lib/providerTelemetry.js';

const indexPath = new URL('../src/index.js', import.meta.url);

test('provider telemetry records only aggregate Calendar monitor data', () => {
  const telemetry = createProviderTelemetry({
    now: () => Date.parse('2026-09-13T01:02:03.000Z'),
  });

  telemetry.recordGoogleCalendarMonitorListRequest();
  telemetry.recordGoogleCalendarMonitorListRequest();
  telemetry.recordGoogleCalendarMonitorListFailure({ response: { status: 403 } });

  assert.deepEqual(telemetry.snapshot().googleCalendarMonitor, {
    listRequests: 2,
    listFailures: 1,
    lastFailureAt: '2026-09-13T01:02:03.000Z',
    lastFailureStatus: 403,
  });
});

test('provider telemetry records Discord REST rate limits without route identifiers', () => {
  const telemetry = createProviderTelemetry({
    now: () => Date.parse('2026-09-13T04:05:06.000Z'),
  });

  telemetry.recordDiscordRestRateLimit({ global: true, retryAfter: 1200, route: '/channels/secret' });
  telemetry.recordDiscordRestRateLimit({ global: false, retryAfter: 250, route: '/guilds/secret' });

  assert.deepEqual(telemetry.snapshot().discordRest, {
    rateLimitEvents: 2,
    globalRateLimitEvents: 1,
    lastRateLimitAt: '2026-09-13T04:05:06.000Z',
    lastRetryAfterMs: 250,
    maxRetryAfterMs: 1200,
  });
  assert.equal(JSON.stringify(telemetry.snapshot()).includes('secret'), false);
});

test('provider telemetry snapshots cannot mutate internal counters', () => {
  const telemetry = createProviderTelemetry();
  telemetry.recordGoogleCalendarMonitorListRequest();

  const snapshot = telemetry.snapshot();
  snapshot.googleCalendarMonitor.listRequests = 99;
  snapshot.discordRest.rateLimitEvents = 99;

  assert.equal(telemetry.snapshot().googleCalendarMonitor.listRequests, 1);
  assert.equal(telemetry.snapshot().discordRest.rateLimitEvents, 0);
});

test('runtime exposes provider telemetry and listens for Discord rate limits', async () => {
  const source = await readFile(indexPath, 'utf8');

  assert.match(source, /RESTEvents\.RateLimited/);
  assert.match(source, /recordDiscordRestRateLimit\(data\)/);
  assert.match(source, /providers:\s*getProviderTelemetry\(\)/);
});
