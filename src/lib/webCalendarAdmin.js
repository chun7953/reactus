import {
    createWebSchedule as createWebScheduleCore,
    deleteWebSchedule as deleteWebScheduleCore,
    listWebSchedules as listWebSchedulesCore,
} from './webCalendarAdminCore.js';
import { get } from './settingsCache.js';
import {
    deleteCalendarAdminSnapshots,
    readCalendarAdminSnapshot,
    writeCalendarAdminSnapshot,
} from './calendarAdminSnapshotStore.js';

export * from './webCalendarAdminCore.js';

const CALENDAR_LIST_CACHE_TTL_MS = 60_000;
const CALENDAR_LOAD_TIMEOUT_MS = 28_000;
const SHARED_FORWARD_DAYS = 90;
const SHARED_PAST_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

const calendarListCache = new Map();
const calendarListInflight = new Map();
const calendarListGeneration = new Map();
const calendarPersistBypassGuilds = new Set();

function safeDays(value, fallback, min = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(365, Math.trunc(number)));
}

function canonicalWindow(days, pastDays) {
    if (days <= SHARED_FORWARD_DAYS && pastDays <= SHARED_PAST_DAYS) {
        return { days: SHARED_FORWARD_DAYS, pastDays: SHARED_PAST_DAYS };
    }
    return { days, pastDays };
}

function cacheKey(guildId, window) {
    return `${guildId}:${window.days}:${window.pastDays}`;
}

function generationFor(guildId) {
    return calendarListGeneration.get(String(guildId)) || 0;
}

function eventBounds(event) {
    const start = new Date(event?.start || 0).getTime();
    const end = new Date(event?.end || event?.start || 0).getTime();
    return {
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(end) ? end : start,
    };
}

function filterWindow(events, days, pastDays, now = Date.now()) {
    const min = now - pastDays * DAY_MS;
    const max = now + days * DAY_MS;
    return (events || []).filter(event => {
        const bounds = eventBounds(event);
        return bounds.start < max && Math.max(bounds.end, bounds.start) >= min;
    });
}

function calendarLoadTimeout() {
    const error = new Error('Googleカレンダーの応答に時間がかかっています。少し待って更新してください。');
    error.code = 'REACTUS_CALENDAR_TIMEOUT';
    return error;
}

function withCalendarTimeout(promise) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(calendarLoadTimeout()), CALENDAR_LOAD_TIMEOUT_MS);
        }),
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

async function readPersistedSnapshot(guildId, window) {
    if (calendarPersistBypassGuilds.has(String(guildId))) return null;
    try {
        return await readCalendarAdminSnapshot(guildId, window.days, window.pastDays);
    } catch (error) {
        console.warn('[WebAdminCalendar] persisted snapshot read failed:', error?.message || error);
        return null;
    }
}

async function refreshSnapshot(guildId, window) {
    const key = cacheKey(guildId, window);
    if (calendarListInflight.has(key)) return calendarListInflight.get(key);

    const generation = generationFor(guildId);
    const startedAt = Date.now();
    const loading = withCalendarTimeout(listWebSchedulesCore(guildId, window.days, window.pastDays))
        .then(events => {
            if (generationFor(guildId) === generation) {
                calendarListCache.set(key, { loadedAt: Date.now(), events });
                calendarPersistBypassGuilds.delete(String(guildId));
                void writeCalendarAdminSnapshot(guildId, window.days, window.pastDays, events)
                    .catch(error => console.warn('[WebAdminCalendar] persisted snapshot write failed:', error?.message || error));
            }
            console.log(
                `[WebAdminCalendar] loaded guild=${guildId} days=${window.days} pastDays=${window.pastDays} events=${events.length} ms=${Date.now() - startedAt}`,
            );
            return events;
        })
        .catch(async error => {
            const stale = calendarListCache.get(key);
            if (stale?.events) {
                console.warn(
                    `[WebAdminCalendar] refresh failed; using stale memory cache guild=${guildId} ms=${Date.now() - startedAt}:`,
                    error?.message || error,
                );
                return stale.events;
            }
            const persisted = await readPersistedSnapshot(guildId, window);
            if (persisted?.events) {
                calendarListCache.set(key, persisted);
                console.warn(
                    `[WebAdminCalendar] refresh failed; using persisted cache guild=${guildId} ms=${Date.now() - startedAt}:`,
                    error?.message || error,
                );
                return persisted.events;
            }
            console.error(
                `[WebAdminCalendar] load failed guild=${guildId} days=${window.days} pastDays=${window.pastDays} ms=${Date.now() - startedAt}:`,
                error?.message || error,
            );
            throw error;
        });

    calendarListInflight.set(key, loading);
    try {
        return await loading;
    } finally {
        if (calendarListInflight.get(key) === loading) calendarListInflight.delete(key);
    }
}

async function loadSnapshot(guildId, window, forceRefresh = false) {
    const key = cacheKey(guildId, window);
    if (forceRefresh) return refreshSnapshot(guildId, window);

    const cached = calendarListCache.get(key);
    if (cached) {
        if (Date.now() - cached.loadedAt >= CALENDAR_LIST_CACHE_TTL_MS) {
            void refreshSnapshot(guildId, window).catch(() => {});
        }
        return cached.events;
    }

    const persisted = await readPersistedSnapshot(guildId, window);
    if (persisted) {
        calendarListCache.set(key, persisted);
        if (Date.now() - persisted.loadedAt >= CALENDAR_LIST_CACHE_TTL_MS) {
            void refreshSnapshot(guildId, window).catch(() => {});
        }
        return persisted.events;
    }

    return refreshSnapshot(guildId, window);
}

export function invalidateWebScheduleCache(guildId = null) {
    if (!guildId) {
        calendarListCache.clear();
        calendarListInflight.clear();
        calendarListGeneration.clear();
        calendarPersistBypassGuilds.clear();
        return;
    }
    const id = String(guildId);
    calendarListGeneration.set(id, generationFor(id) + 1);
    calendarPersistBypassGuilds.add(id);
    const prefix = `${id}:`;
    for (const key of calendarListCache.keys()) {
        if (key.startsWith(prefix)) calendarListCache.delete(key);
    }
    for (const key of calendarListInflight.keys()) {
        if (key.startsWith(prefix)) calendarListInflight.delete(key);
    }
    void deleteCalendarAdminSnapshots(id)
        .catch(error => console.warn('[WebAdminCalendar] persisted snapshot invalidation failed:', error?.message || error));
}

export async function listWebSchedules(guildId, days = 90, pastDays = 0, { forceRefresh = false } = {}) {
    const requestedDays = safeDays(days, 90, 1);
    const requestedPastDays = safeDays(pastDays, 0, 0);
    const window = canonicalWindow(requestedDays, requestedPastDays);
    const events = await loadSnapshot(guildId, window, forceRefresh);
    return filterWindow(events, requestedDays, requestedPastDays);
}

export async function warmAllWebScheduleCaches() {
    const monitors = await get.allMonitors();
    const guildIds = [...new Set(monitors.map(monitor => String(monitor.guild_id)).filter(Boolean))];
    await Promise.allSettled(guildIds.map(guildId => loadSnapshot(
        guildId,
        { days: SHARED_FORWARD_DAYS, pastDays: SHARED_PAST_DAYS },
        false,
    )));
}

export async function createWebSchedule(guildId, payload) {
    const event = await createWebScheduleCore(guildId, payload);
    invalidateWebScheduleCache(guildId);
    return event;
}

export async function deleteWebSchedule(guildId, payload) {
    const result = await deleteWebScheduleCore(guildId, payload);
    invalidateWebScheduleCache(guildId);
    return result;
}

export const webCalendarListCacheConfig = Object.freeze({
    ttlMs: CALENDAR_LIST_CACHE_TTL_MS,
    loadTimeoutMs: CALENDAR_LOAD_TIMEOUT_MS,
    sharedForwardDays: SHARED_FORWARD_DAYS,
    sharedPastDays: SHARED_PAST_DAYS,
    persistent: true,
    staleWhileRevalidate: true,
});
