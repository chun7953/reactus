import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCalendarPostAssets } from '../src/lib/calendarAssetReconciliation.js';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const asset = {
  id: 'asset-1', guild_id: 'guild-1', calendar_id: 'owner@example.com', event_id: 'event-1',
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  last_verified_at: new Date('2026-09-09T00:00:00.000Z'),
  last_checked_at: new Date('2026-09-10T00:00:00.000Z'),
  missing_since: new Date('2026-09-10T00:00:00.000Z'),
};

test('verified calendar set change during final scan defers cleanup', async () => {
  let claimReads = 0;
  let removed = 0;
  let deferred = 0;
  const db = {
    async query() {
      claimReads += 1;
      const ids = claimReads === 1
        ? ['owner@example.com']
        : ['new@example.com', 'owner@example.com'];
      return { rows: ids.map(calendar_id => ({ calendar_id })) };
    },
  };
  const calendar = { events: {
    async get() { throw Object.assign(new Error('missing'), { code: 404 }); },
    async list() { return { data: { items: [] } }; },
  } };
  const assetStore = {
    async listCalendarPostImageReconciliationCandidates() { return [asset]; },
    async confirmCalendarPostImageReference() { return true; },
    async markCalendarPostImageMissing() { return true; },
    async deleteCalendarPostImageIfUnchanged() { removed += 1; return true; },
    async recordCalendarPostImageReconciliationAttempt() { deferred += 1; return true; },
  };

  const stats = await reconcileCalendarPostAssets(
    { guilds: { cache: new Map([['guild-1', {}]]) } },
    { db, calendar, now: () => NOW, assetStore },
  );

  assert.equal(claimReads, 2);
  assert.equal(removed, 0);
  assert.equal(deferred, 1);
  assert.equal(stats.deleted, 0);
  assert.equal(stats.deferred, 1);
});
