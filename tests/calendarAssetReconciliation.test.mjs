import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_ASSET_MISSING_CONFIRMATION_MS,
  reconcileCalendarPostAssets,
} from '../src/lib/calendarAssetReconciliation.js';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const baseAsset = {
  id: 'asset-1', guild_id: 'guild-1', calendar_id: 'owner@example.com', event_id: 'event-1',
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  last_verified_at: new Date('2026-09-10T00:00:00.000Z'),
  last_checked_at: new Date('2026-09-10T00:00:00.000Z'), missing_since: null,
};

function client() { return { guilds: { cache: new Map([['guild-1', {}]]) } }; }
function db(ids) {
  return { async query() { return { rows: ids.map(calendar_id => ({ calendar_id })) }; } };
}
function live(id = 'event-1') {
  return { id, status: 'confirmed', extendedProperties: { private: { reactusAssetId: 'asset-1' } } };
}
function missing() { return Object.assign(new Error('missing'), { code: 404 }); }
function store(asset, calls) {
  return {
    async listCalendarPostImageReconciliationCandidates() { return [asset]; },
    async confirmCalendarPostImageReference(item, options) { calls.confirm.push(options); return true; },
    async markCalendarPostImageMissing() { calls.mark += 1; return true; },
    async deleteCalendarPostImageIfUnchanged() { calls.remove += 1; return true; },
    async recordCalendarPostImageReconciliationAttempt() { calls.defer += 1; return true; },
  };
}

test('live owner is confirmed without all-calendar scan', async () => {
  const calls = { confirm: [], mark: 0, remove: 0, defer: 0, scans: 0 };
  const calendar = { events: {
    async get() { return { data: live() }; },
    async list() { calls.scans += 1; return { data: { items: [] } }; },
  } };
  const stats = await reconcileCalendarPostAssets(client(), {
    db: db(['owner@example.com', 'other@example.com']), calendar, now: () => NOW,
    assetStore: store(baseAsset, calls),
  });
  assert.equal(stats.verified, 1);
  assert.equal(calls.scans, 0);
  assert.equal(calls.remove, 0);
});

test('moved live reference is rebound instead of treated as absent', async () => {
  const calls = { confirm: [], mark: 0, remove: 0, defer: 0 };
  const calendar = { events: {
    async get() { throw missing(); },
    async list({ calendarId }) {
      return { data: { items: calendarId === 'moved@example.com' ? [live('event-2')] : [] } };
    },
  } };
  const stats = await reconcileCalendarPostAssets(client(), {
    db: db(['owner@example.com', 'moved@example.com']), calendar, now: () => NOW,
    assetStore: store(baseAsset, calls),
  });
  assert.equal(stats.rebound, 1);
  assert.equal(calls.confirm[0].calendarId, 'moved@example.com');
  assert.equal(calls.confirm[0].eventId, 'event-2');
  assert.equal(calls.remove, 0);
});

test('first complete absence starts probation and does not remove asset', async () => {
  const calls = { confirm: [], mark: 0, remove: 0, defer: 0 };
  const calendar = { events: {
    async get() { throw missing(); },
    async list() { return { data: { items: [] } }; },
  } };
  const stats = await reconcileCalendarPostAssets(client(), {
    db: db(['owner@example.com', 'other@example.com']), calendar, now: () => NOW,
    assetStore: store(baseAsset, calls),
  });
  assert.equal(stats.missingMarked, 1);
  assert.equal(calls.mark, 1);
  assert.equal(calls.remove, 0);
});

test('confirmed absence after 24 hours permits unchanged asset cleanup', async () => {
  const calls = { confirm: [], mark: 0, remove: 0, defer: 0 };
  const asset = {
    ...baseAsset,
    missing_since: new Date(NOW.getTime() - CALENDAR_ASSET_MISSING_CONFIRMATION_MS - 1),
  };
  const calendar = { events: {
    async get() { throw missing(); },
    async list() { return { data: { items: [] } }; },
  } };
  const stats = await reconcileCalendarPostAssets(client(), {
    db: db(['owner@example.com']), calendar, now: () => NOW,
    assetStore: store(asset, calls),
  });
  assert.equal(stats.deleted, 1);
  assert.equal(calls.remove, 1);
});
