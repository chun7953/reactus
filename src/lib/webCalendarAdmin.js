import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { get } from './settingsCache.js';
import {
    buildRecurrence,
    formatJstDateTime,
    parseJstDateTime,
} from './calendarScheduling.js';
import {
    deleteCalendarPostImage,
    storeCalendarPostImageBuffer,
} from './calendarPostAssets.js';
import { listAllCalendarEvents } from './calendarEventPager.js';
import { recurrenceBeforeTarget, recurringTargetStart } from './calendarSeriesSplit.js';
import { resolveCalendarEventPrivateProperties } from './calendarEventMetadata.js';
import {
    buildCalendarRoutingProperties,
    calendarDisplaySummary,
    resolveCalendarRoute,
} from './calendarRouting.js';

function cleanKeyword(value) {
    return String(value || '').replace(/[【】]/g, '').trim();
}

async function calendarClient() {
    const { auth } = await initializeSheetsAPI();
    return { calendar: google.calendar({ version: 'v3', auth }), auth };
}

function permissionHelp(auth, calendarId) {
    const email = auth?.email ? ` サービスアカウント: ${auth.email}` : '';
    return `カレンダー ${calendarId} に予定を書き込めません。GoogleカレンダーでReactusのサービスアカウントに「予定の変更」権限を付けてください。${email}`;
}

function parseRequiredDateTime(value, label) {
    const result = parseJstDateTime(String(value || '').replace('T', ' '));
    if (!result) throw new Error(`${label}を正しく入力してください。`);
    return result;
}

function normalizeRecurrence(input, start) {
    const recurrence = input || {};
    return buildRecurrence({
        unit: recurrence.unit || 'once',
        interval: Number(recurrence.interval || 1),
        weekdays: Array.isArray(recurrence.weekdays) ? recurrence.weekdays.join(',') : recurrence.weekdays,
        monthlyDay: recurrence.monthlyDay === '' || recurrence.monthlyDay === undefined || recurrence.monthlyDay === null
            ? null : Number(recurrence.monthlyDay),
        monthlyWeek: recurrence.monthlyWeek || null,
        monthlyWeekday: recurrence.monthlyWeekday || null,
        until: recurrence.until || null,
        count: recurrence.count === '' || recurrence.count === undefined || recurrence.count === null
            ? null : Number(recurrence.count),
        start,
    });
}

function normalizeMention(payload) {
    const mode = payload?.mode || 'default';
    if (!['default', 'none', 'role'].includes(mode)) throw new Error('メンション設定が正しくありません。');
    const properties = { reactusMentionMode: mode };
    if (mode === 'role') {
        const roleId = String(payload?.roleId || '').trim();
        if (!/^\d+$/.test(roleId)) throw new Error('メンションするロールを選択してください。');
        properties.reactusMentionRoleId = roleId;
    }
    return properties;
}

function decodeImage(image) {
    if (!image) return null;
    if (!String(image.contentType || '').startsWith('image/')) throw new Error('画像ファイルを指定してください。');
    const data = Buffer.from(String(image.base64 || ''), 'base64');
    if (data.length === 0) throw new Error('画像データを読み込めませんでした。');
    return {
        filename: String(image.filename || 'image').slice(0, 255),
        contentType: String(image.contentType),
        data,
    };
}

async function findMonitor(guildId, monitorId, type) {
    const monitors = await get.monitorsByGuild(guildId);
    const monitor = monitors.find(candidate => String(candidate.id) === String(monitorId));
    if (!monitor) throw new Error('投稿先のカレンダー設定が見つかりません。');
    const keyword = cleanKeyword(monitor.trigger_keyword);
    if (type === 'giveaway' && keyword !== 'ラキショ') {
        throw new Error('選択した投稿先は抽選用に設定されていません。');
    }
    if (type === 'post' && keyword === 'ラキショ') {
        throw new Error('選択した投稿先は通常投稿用に設定されていません。');
    }
    return monitor;
}

async function insertEvent({ calendar, auth, monitor, requestBody }) {
    try {
        const response = await calendar.events.insert({
            calendarId: monitor.calendar_id,
            requestBody,
        });
        return response.data;
    } catch (error) {
        if (error?.code === 403 || error?.code === 404) {
            throw new Error(permissionHelp(auth, monitor.calendar_id));
        }
        throw error;
    }
}

export async function createWebSchedule(guildId, payload) {
    const type = payload?.type;
    if (!['post', 'giveaway'].includes(type)) throw new Error('予定の種類が正しくありません。');
    const monitor = await findMonitor(guildId, payload.monitorId, type);
    const start = parseRequiredDateTime(payload.startTime, type === 'giveaway' ? '抽選開始日時' : '投稿日時');
    const recurrence = normalizeRecurrence(payload.recurrence, start);
    const mentionProperties = normalizeMention(payload.mention);
    const image = decodeImage(payload.image);
    let assetId = null;

    try {
        if (image) assetId = await storeCalendarPostImageBuffer(guildId, image);
        const privateProperties = {
            ...mentionProperties,
            ...buildCalendarRoutingProperties(monitor, type),
            ...(assetId ? { reactusAssetId: assetId } : {}),
        };
        const { calendar, auth } = await calendarClient();

        if (type === 'post') {
            const title = String(payload.title || '').trim();
            if (!title) throw new Error('タイトルを入力してください。');
            const durationMinutes = Number(payload.durationMinutes || 30);
            if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
                throw new Error('予定の長さは1〜1440分で指定してください。');
            }
            const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
            return await insertEvent({
                calendar,
                auth,
                monitor,
                requestBody: {
                    summary: title,
                    description: String(payload.body || ''),
                    start: { dateTime: formatJstDateTime(start), timeZone: 'Asia/Tokyo' },
                    end: { dateTime: formatJstDateTime(end), timeZone: 'Asia/Tokyo' },
                    extendedProperties: { private: privateProperties },
                    ...(recurrence ? { recurrence } : {}),
                },
            });
        }

        const end = parseRequiredDateTime(payload.endTime, '抽選終了日時');
        if (end <= start) throw new Error('抽選終了日時は開始日時より後にしてください。');
        const rawPrizes = Array.isArray(payload.prizes) ? payload.prizes : [];
        if (rawPrizes.length < 1) throw new Error('景品を1つ以上追加してください。');
        if (rawPrizes.length > 50) throw new Error('1つの予定に登録できる景品は50件までです。');
        const prizes = rawPrizes.map((entry, index) => {
            const prize = String(entry?.name || '').trim();
            const winners = Number(entry?.winners);
            if (!prize) throw new Error(`景品${index + 1}の名前を入力してください。`);
            if (!Number.isInteger(winners) || winners < 1 || winners > 100) {
                throw new Error(`景品${index + 1}の当選人数は1〜100人で指定してください。`);
            }
            return { prize, winners };
        });
        const prizeLines = prizes.map(({ prize, winners }) => `【${prize}/${winners}】`);
        const description = [prizeLines.join('\n'), String(payload.message || '').trim()].filter(Boolean).join('\n');
        return await insertEvent({
            calendar,
            auth,
            monitor,
            requestBody: {
                summary: prizes[0].prize,
                description,
                start: { dateTime: formatJstDateTime(start), timeZone: 'Asia/Tokyo' },
                end: { dateTime: formatJstDateTime(end), timeZone: 'Asia/Tokyo' },
                extendedProperties: { private: privateProperties },
                ...(recurrence ? { recurrence } : {}),
            },
        });
    } catch (error) {
        if (assetId) await deleteCalendarPostImage(assetId, guildId).catch(() => {});
        throw error;
    }
}

export async function listWebSchedules(guildId, days = 90, pastDays = 0) {
    const safeDays = Math.max(1, Math.min(365, Number(days) || 90));
    const safePastDays = Math.max(0, Math.min(365, Number(pastDays) || 0));
    const monitors = await get.monitorsByGuild(guildId);
    const byCalendar = new Map();
    for (const monitor of monitors) {
        if (!byCalendar.has(monitor.calendar_id)) byCalendar.set(monitor.calendar_id, []);
        byCalendar.get(monitor.calendar_id).push(monitor);
    }
    if (byCalendar.size === 0) return [];

    const { calendar } = await calendarClient();
    const now = new Date();
    const timeMin = new Date(now.getTime() - safePastDays * 24 * 60 * 60 * 1000);
    const timeMax = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
    const rows = [];
    const masterMetadataCache = new Map();
    for (const [calendarId, calendarMonitors] of byCalendar) {
        const events = await listAllCalendarEvents(calendar, {
            calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            timeZone: 'Asia/Tokyo',
        });
        for (const event of events) {
            const privateProperties = await resolveCalendarEventPrivateProperties(
                calendar,
                calendarId,
                event,
                masterMetadataCache,
            );
            const route = resolveCalendarRoute(event, calendarMonitors, privateProperties);
            if (!route) continue;
            const monitor = route.monitor;
            rows.push({
                id: event.id,
                calendarId,
                monitorId: monitor.id,
                channelId: monitor.channel_id,
                triggerKeyword: cleanKeyword(monitor.trigger_keyword),
                type: route.type,
                summary: calendarDisplaySummary(event, route),
                description: event.description || '',
                start: event.start?.dateTime || event.start?.date || null,
                end: event.end?.dateTime || event.end?.date || null,
                recurringEventId: event.recurringEventId || null,
                hasImage: Boolean(privateProperties.reactusAssetId),
                htmlLink: event.htmlLink || null,
                isPast: new Date(event.end?.dateTime || event.end?.date || event.start?.dateTime || event.start?.date) < now,
            });
        }
    }
    rows.sort((a, b) => new Date(a.start) - new Date(b.start));
    return rows;
}

function sameOccurrenceStart(instance, master) {
    const instanceStart = recurringTargetStart(instance).getTime();
    const masterStart = new Date(master.start?.dateTime || master.start?.date).getTime();
    return Number.isFinite(masterStart) && instanceStart === masterStart;
}

export async function deleteWebSchedule(guildId, { calendarId, eventId, scope = 'instance' }) {
    if (!['instance', 'future', 'series'].includes(scope)) throw new Error('削除範囲が正しくありません。');
    const monitors = await get.monitorsByGuild(guildId);
    const calendarMonitors = monitors.filter(monitor => monitor.calendar_id === calendarId);
    if (calendarMonitors.length === 0) throw new Error('このカレンダーを操作する権限がありません。');
    const { calendar, auth } = await calendarClient();
    try {
        const response = await calendar.events.get({ calendarId, eventId });
        const event = response.data;
        const privateProperties = await resolveCalendarEventPrivateProperties(calendar, calendarId, event);
        const route = resolveCalendarRoute(event, calendarMonitors, privateProperties);
        if (!route) throw new Error('Reactusが管理している予定ではありません。');

        let master = null;
        if (event.recurringEventId) {
            master = (await calendar.events.get({ calendarId, eventId: event.recurringEventId })).data;
        }

        if (scope === 'future') {
            if (!master) throw new Error('「これ以降を削除」は繰り返し予定の各回で使用してください。');
            const assetId = master.extendedProperties?.private?.reactusAssetId || null;
            if (sameOccurrenceStart(event, master)) {
                await calendar.events.delete({ calendarId, eventId: master.id });
                await deleteCalendarPostImage(assetId, guildId).catch(() => {});
                return { deletedSeries: true, deletedFuture: true };
            }
            const targetStart = recurringTargetStart(event);
            await calendar.events.patch({
                calendarId,
                eventId: master.id,
                requestBody: { recurrence: recurrenceBeforeTarget(master.recurrence || [], targetStart) },
            });
            return { deletedSeries: false, deletedFuture: true };
        }

        const deleteSeries = scope === 'series' && Boolean(master);
        const deleteId = deleteSeries ? master.id : event.id;
        const assetId = deleteSeries
            ? master.extendedProperties?.private?.reactusAssetId || null
            : event.extendedProperties?.private?.reactusAssetId || null;
        await calendar.events.delete({ calendarId, eventId: deleteId });
        if (!event.recurringEventId || deleteSeries) {
            await deleteCalendarPostImage(assetId, guildId).catch(() => {});
        }
        return { deletedSeries: Boolean(deleteSeries), deletedFuture: false };
    } catch (error) {
        if (error?.code === 403) {
            throw new Error(permissionHelp(auth, calendarId));
        }
        if (error?.code === 404) throw new Error('予定が見つかりません。既に削除されている可能性があります。');
        throw error;
    }
}
