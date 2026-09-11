import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { getDBPool } from './settingsCache.js';
import {
    confirmCalendarPostImageReference,
    deleteCalendarPostImageIfUnchanged,
    listCalendarPostImageReconciliationCandidates,
    markCalendarPostImageMissing,
    recordCalendarPostImageReconciliationAttempt,
} from './calendarPostAssets.js';

export const CALENDAR_ASSET_RECHECK_MS = 24 * 60 * 60 * 1000;
export const CALENDAR_ASSET_MISSING_CONFIRMATION_MS = 24 * 60 * 60 * 1000;
export const CALENDAR_ASSET_RECONCILIATION_BATCH_SIZE = 20;

function activeGuildIds(client) {
    const cache = client?.guilds?.cache;
    if (!cache || typeof cache.keys !== 'function') return [];
    return [...cache.keys()].map(value => String(value || '').trim()).filter(Boolean);
}

function eventAssetId(event) {
    return String(event?.extendedProperties?.private?.reactusAssetId || '').trim();
}

function isLiveAssetReference(event, assetId) {
    return Boolean(
        event?.id
        && event?.status !== 'cancelled'
        && eventAssetId(event) === assetId
    );
}

async function verifiedCalendarIds(db, guildId) {
    const result = await db.query(
        `SELECT calendar_id
           FROM calendar_claims
          WHERE guild_id = $1
            AND verified_at IS NOT NULL
          ORDER BY calendar_id`,
        [guildId],
    );
    return (result.rows || []).map(row => String(row.calendar_id || '').trim()).filter(Boolean);
}

function sameCalendarSet(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function findLiveAssetReference(calendar, calendarIds, assetId) {
    for (const calendarId of calendarIds) {
        const response = await calendar.events.list({
            calendarId,
            privateExtendedProperty: [`reactusAssetId=${assetId}`],
            showDeleted: false,
            singleEvents: false,
            maxResults: 10,
        });
        const event = (response.data.items || []).find(item => isLiveAssetReference(item, assetId));
        if (event) return { calendarId, eventId: event.id };
    }
    return null;
}

function ownerNeedsReferenceScan(error) {
    return error?.code === 404 || error?.code === 410;
}

export async function reconcileCalendarPostAssets(client, {
    db: suppliedDb,
    calendar: suppliedCalendar,
    now = () => new Date(),
    batchSize = CALENDAR_ASSET_RECONCILIATION_BATCH_SIZE,
    logger = console,
    assetStore = {
        confirmCalendarPostImageReference,
        deleteCalendarPostImageIfUnchanged,
        listCalendarPostImageReconciliationCandidates,
        markCalendarPostImageMissing,
        recordCalendarPostImageReconciliationAttempt,
    },
} = {}) {
    const guildIds = activeGuildIds(client);
    const stats = {
        candidates: 0,
        verified: 0,
        rebound: 0,
        missingMarked: 0,
        deleted: 0,
        deferred: 0,
    };
    if (guildIds.length === 0) return stats;

    const checkedAt = now();
    const dueBefore = new Date(checkedAt.getTime() - CALENDAR_ASSET_RECHECK_MS);
    const missingBefore = new Date(checkedAt.getTime() - CALENDAR_ASSET_MISSING_CONFIRMATION_MS);
    const candidates = await assetStore.listCalendarPostImageReconciliationCandidates(guildIds, {
        before: dueBefore,
        limit: batchSize,
    });
    stats.candidates = candidates.length;
    if (candidates.length === 0) return stats;

    const db = suppliedDb || await getDBPool();
    let calendar = suppliedCalendar;
    if (!calendar) {
        const { auth } = await initializeSheetsAPI();
        calendar = google.calendar({ version: 'v3', auth });
    }

    const calendarIdsByGuild = new Map();
    for (const asset of candidates) {
        const assetId = String(asset.id);
        const guildId = String(asset.guild_id);
        let calendarIds = calendarIdsByGuild.get(guildId);
        if (!calendarIds) {
            calendarIds = await verifiedCalendarIds(db, guildId);
            calendarIdsByGuild.set(guildId, calendarIds);
        }

        if (!calendarIds.includes(String(asset.calendar_id))) {
            await assetStore.recordCalendarPostImageReconciliationAttempt(asset, { checkedAt });
            stats.deferred += 1;
            continue;
        }

        try {
            try {
                const ownerResponse = await calendar.events.get({
                    calendarId: asset.calendar_id,
                    eventId: asset.event_id,
                });
                if (isLiveAssetReference(ownerResponse.data, assetId)) {
                    const confirmed = await assetStore.confirmCalendarPostImageReference(asset, {
                        calendarId: asset.calendar_id,
                        eventId: asset.event_id,
                        checkedAt,
                    });
                    if (confirmed) stats.verified += 1;
                    else stats.deferred += 1;
                    continue;
                }
            } catch (error) {
                if (!ownerNeedsReferenceScan(error)) throw error;
            }

            const reference = await findLiveAssetReference(calendar, calendarIds, assetId);
            if (reference) {
                const confirmed = await assetStore.confirmCalendarPostImageReference(asset, {
                    ...reference,
                    checkedAt,
                });
                if (confirmed) {
                    stats.verified += 1;
                    if (reference.calendarId !== asset.calendar_id || reference.eventId !== asset.event_id) {
                        stats.rebound += 1;
                    }
                } else {
                    stats.deferred += 1;
                }
                continue;
            }

            const missingSince = asset.missing_since ? new Date(asset.missing_since) : null;
            if (missingSince && Number.isFinite(missingSince.getTime()) && missingSince <= missingBefore) {
                const currentCalendarIds = await verifiedCalendarIds(db, guildId);
                if (!sameCalendarSet(calendarIds, currentCalendarIds)) {
                    await assetStore.recordCalendarPostImageReconciliationAttempt(asset, { checkedAt });
                    calendarIdsByGuild.set(guildId, currentCalendarIds);
                    stats.deferred += 1;
                    continue;
                }
                const deleted = await assetStore.deleteCalendarPostImageIfUnchanged(asset);
                if (deleted) stats.deleted += 1;
                else stats.deferred += 1;
                continue;
            }

            const marked = await assetStore.markCalendarPostImageMissing(asset, { checkedAt });
            if (marked) stats.missingMarked += 1;
            else stats.deferred += 1;
        } catch (error) {
            await assetStore.recordCalendarPostImageReconciliationAttempt(asset, { checkedAt }).catch(() => {});
            stats.deferred += 1;
            logger.warn(
                `[CalendarAssetReconciliation] 画像 ${assetId} の参照確認を完了できませんでした。削除せず保持します:`,
                error?.message || error,
            );
        }
    }

    return stats;
}
