import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { get } from './settingsCache.js';
import { buildRecurrence, formatJstDateTime, parseJstDateTime } from './calendarScheduling.js';
import { buildPrivatePropertiesPatch, parseTriggeredSummary } from './calendarEditHelpers.js';
import { webScheduleDetail } from './webCalendarEditHelpers.js';
import {
    cloneCalendarPostImage,
    deleteCalendarPostImage,
    storeCalendarPostImageBuffer,
} from './calendarPostAssets.js';
import {
    hasCountRule,
    recurrenceBeforeTarget,
    recurrenceForRemainingCount,
    recurringTargetStart,
} from './calendarSeriesSplit.js';

function cleanKeyword(value) {
    return String(value || '').replace(/[【】]/g, '').trim();
}

async function calendarClient() {
    const { auth } = await initializeSheetsAPI();
    return { calendar: google.calendar({ version: 'v3', auth }), auth };
}

function permissionHelp(auth, calendarId) {
    const email = auth?.email ? ` サービスアカウント: ${auth.email}` : '';
    return `カレンダー ${calendarId} の予定を変更できません。GoogleカレンダーでReactusのサービスアカウントに「予定の変更」権限を付けてください。${email}`;
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

function normalizePrizes(rawPrizes) {
    const prizes = Array.isArray(rawPrizes) ? rawPrizes : [];
    if (prizes.length < 1) throw new Error('景品を1つ以上追加してください。');
    if (prizes.length > 50) throw new Error('1つの予定に登録できる景品は50件までです。');
    return prizes.map((entry, index) => {
        const prize = String(entry?.name || '').trim();
        const winners = Number(entry?.winners);
        if (!prize) throw new Error(`景品${index + 1}の名前を入力してください。`);
        if (!Number.isInteger(winners) || winners < 1 || winners > 100) {
            throw new Error(`景品${index + 1}の当選人数は1〜100人で指定してください。`);
        }
        return { prize, winners };
    });
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

async function resolveEvent(guildId, { calendarId, eventId, scope = 'instance' }) {
    if (!calendarId || !eventId) throw new Error('予定を特定できません。');
    if (!['instance', 'future', 'series'].includes(scope)) throw new Error('編集範囲が正しくありません。');

    const monitors = await get.monitorsByGuild(guildId);
    const calendarMonitors = monitors.filter(monitor => monitor.calendar_id === calendarId);
    if (calendarMonitors.length === 0) throw new Error('このカレンダーを操作する権限がありません。');

    const { calendar, auth } = await calendarClient();
    let source;
    try {
        source = (await calendar.events.get({ calendarId, eventId })).data;
    } catch (error) {
        if (error?.code === 403) throw new Error(permissionHelp(auth, calendarId));
        if (error?.code === 404) throw new Error('予定が見つかりません。既に削除されている可能性があります。');
        throw error;
    }

    const sourceTrigger = parseTriggeredSummary(source.summary || '').trigger;
    const sourceMonitor = calendarMonitors.find(monitor => cleanKeyword(monitor.trigger_keyword) === sourceTrigger);
    if (!sourceMonitor) throw new Error('Reactusが管理している予定ではありません。');

    let master = source;
    if (source.recurringEventId) {
        try {
            master = (await calendar.events.get({ calendarId, eventId: source.recurringEventId })).data;
        } catch (error) {
            if (error?.code === 403) throw new Error(permissionHelp(auth, calendarId));
            if (error?.code === 404) throw new Error('繰り返し予定の元データが見つかりません。');
            throw error;
        }
    }

    if (scope === 'future' && !source.recurringEventId) {
        throw new Error('「これ以降」は繰り返し予定の各回から選択してください。');
    }

    const target = scope === 'series' ? master : source;
    const targetTrigger = parseTriggeredSummary(target.summary || '').trigger;
    const monitor = calendarMonitors.find(candidate => cleanKeyword(candidate.trigger_keyword) === targetTrigger);
    if (!monitor) throw new Error('Reactusが管理している予定ではありません。');

    return {
        calendar,
        auth,
        calendarId,
        source,
        target,
        master,
        monitor,
        originalWasRecurring: Boolean(source.recurringEventId || source.recurrence?.length || master.recurrence?.length),
    };
}

async function countInstancesBefore(calendar, calendarId, recurringEventId, targetStart) {
    let count = 0;
    let pageToken = undefined;
    do {
        const response = await calendar.events.instances({
            calendarId,
            eventId: recurringEventId,
            timeMax: targetStart.toISOString(),
            showDeleted: true,
            maxResults: 2500,
            ...(pageToken ? { pageToken } : {}),
        });
        count += (response.data.items || []).length;
        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return count;
}

async function futureDetailEvent(resolved) {
    let recurrence = resolved.master.recurrence || [];
    if (hasCountRule(recurrence)) {
        const skipped = await countInstancesBefore(
            resolved.calendar,
            resolved.calendarId,
            resolved.master.id,
            recurringTargetStart(resolved.source),
        );
        recurrence = recurrenceForRemainingCount(recurrence, skipped);
    }
    return {
        ...resolved.source,
        recurrence,
        recurringEventId: resolved.master.id,
    };
}

export async function getWebScheduleDetail(guildId, request) {
    const resolved = await resolveEvent(guildId, request);
    const detailEvent = request.scope === 'future'
        ? await futureDetailEvent(resolved)
        : resolved.target;
    return {
        ...webScheduleDetail(detailEvent, resolved.monitor),
        requestedEventId: resolved.source.id,
        editEventId: resolved.target.id,
        scope: request.scope || 'instance',
        originalWasRecurring: resolved.originalWasRecurring,
    };
}

function privatePropertiesForUpdate(existing, payload, imageMode, newAssetId) {
    const mentionMode = payload?.mention?.mode || 'default';
    if (!['default', 'none', 'role'].includes(mentionMode)) throw new Error('メンション設定が正しくありません。');
    const roleId = mentionMode === 'role' ? String(payload?.mention?.roleId || '').trim() : null;
    if (mentionMode === 'role' && !/^\d+$/.test(roleId)) {
        throw new Error('メンションするロールを選択してください。');
    }
    return buildPrivatePropertiesPatch(existing || {}, {
        mention: mentionMode === 'none' ? false : true,
        mentionRoleId: roleId,
        assetMode: imageMode,
        assetId: newAssetId,
    });
}

function buildRequestBody({ targetType, payload, start, monitor, privateProperties, recurrenceIncluded, recurrence }) {
    if (targetType === 'post') {
        const title = String(payload.title || '').trim();
        if (!title) throw new Error('タイトルを入力してください。');
        const durationMinutes = Number(payload.durationMinutes || 30);
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
            throw new Error('予定の長さは1〜1440分で指定してください。');
        }
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const trigger = cleanKeyword(monitor.trigger_keyword);
        return {
            summary: `【${trigger}】${title}`,
            description: String(payload.body || ''),
            start: { dateTime: formatJstDateTime(start), timeZone: 'Asia/Tokyo' },
            end: { dateTime: formatJstDateTime(end), timeZone: 'Asia/Tokyo' },
            extendedProperties: { private: privateProperties },
            ...(recurrenceIncluded ? { recurrence: recurrence || [] } : {}),
        };
    }

    const end = parseRequiredDateTime(payload.endTime, '抽選終了日時');
    if (end <= start) throw new Error('抽選終了日時は開始日時より後にしてください。');
    const prizes = normalizePrizes(payload.prizes);
    const prizeLines = prizes.map(({ prize, winners }) => `【${prize}/${winners}】`);
    const description = [prizeLines.join('\n'), String(payload.message || '').trim()].filter(Boolean).join('\n');
    return {
        summary: `【ラキショ】${prizes[0].prize}`,
        description,
        start: { dateTime: formatJstDateTime(start), timeZone: 'Asia/Tokyo' },
        end: { dateTime: formatJstDateTime(end), timeZone: 'Asia/Tokyo' },
        extendedProperties: { private: privateProperties },
        ...(recurrenceIncluded ? { recurrence: recurrence || [] } : {}),
    };
}

async function updateFutureSchedule(guildId, payload, resolved, targetType, start, imageMode, image) {
    const targetStart = recurringTargetStart(resolved.source);
    const skipped = await countInstancesBefore(
        resolved.calendar,
        resolved.calendarId,
        resolved.master.id,
        targetStart,
    );

    // Selecting the first occurrence means "this and following" is equivalent
    // to editing the whole series and does not need a split.
    if (skipped === 0) {
        return updateWebSchedule(guildId, { ...payload, scope: 'series' });
    }

    const originalRecurrence = [...(resolved.master.recurrence || [])];
    if (!originalRecurrence.length) throw new Error('繰り返しルールが見つかりません。');
    const trimmedRecurrence = recurrenceBeforeTarget(originalRecurrence, targetStart);
    const futureRecurrence = normalizeRecurrence(payload.recurrence, start);
    const existingPrivate = resolved.master.extendedProperties?.private || {};
    const oldAssetId = existingPrivate.reactusAssetId || null;
    let newAssetId = null;

    try {
        if (imageMode === 'replace') {
            newAssetId = await storeCalendarPostImageBuffer(guildId, image);
        } else if (imageMode === 'keep' && oldAssetId) {
            newAssetId = await cloneCalendarPostImage(guildId, oldAssetId);
            if (!newAssetId) throw new Error('定期投稿の既存画像を複製できませんでした。');
        }

        const assetModeForNewSeries = imageMode === 'remove'
            ? 'remove'
            : (newAssetId ? 'replace' : 'keep');
        const privateProperties = privatePropertiesForUpdate(
            existingPrivate,
            payload,
            assetModeForNewSeries,
            newAssetId,
        );
        const requestBody = buildRequestBody({
            targetType,
            payload,
            start,
            monitor: resolved.monitor,
            privateProperties,
            recurrenceIncluded: true,
            recurrence: futureRecurrence,
        });

        await resolved.calendar.events.patch({
            calendarId: resolved.calendarId,
            eventId: resolved.master.id,
            requestBody: { recurrence: trimmedRecurrence },
        });

        try {
            return (await resolved.calendar.events.insert({
                calendarId: resolved.calendarId,
                requestBody,
            })).data;
        } catch (error) {
            // Splitting is a two-request Calendar API operation. If creating
            // the new half fails, restore the original rule to avoid silently
            // deleting all later occurrences.
            await resolved.calendar.events.patch({
                calendarId: resolved.calendarId,
                eventId: resolved.master.id,
                requestBody: { recurrence: originalRecurrence },
            }).catch(rollbackError => {
                console.error('[WebCalendarEdit] 繰り返し予定の分割ロールバックに失敗:', rollbackError);
            });
            throw error;
        }
    } catch (error) {
        if (newAssetId) await deleteCalendarPostImage(newAssetId, guildId).catch(() => {});
        if (error?.code === 403) throw new Error(permissionHelp(resolved.auth, resolved.calendarId));
        throw error;
    }
}

export async function updateWebSchedule(guildId, payload) {
    const scope = payload?.scope || 'instance';
    const resolved = await resolveEvent(guildId, {
        calendarId: payload?.calendarId,
        eventId: payload?.eventId,
        scope,
    });
    const targetType = parseTriggeredSummary(resolved.target.summary || '').trigger === 'ラキショ' ? 'giveaway' : 'post';
    if (payload?.type !== targetType) throw new Error('予定の種類は編集時に変更できません。');

    const start = parseRequiredDateTime(payload.startTime, targetType === 'giveaway' ? '抽選開始日時' : '投稿日時');
    const recurrenceAllowed = !resolved.originalWasRecurring || scope === 'series' || scope === 'future';
    const recurrence = recurrenceAllowed ? normalizeRecurrence(payload.recurrence, start) : undefined;

    const imageMode = payload?.imageMode || 'keep';
    if (!['keep', 'replace', 'remove'].includes(imageMode)) throw new Error('画像の変更方法が正しくありません。');
    if (resolved.originalWasRecurring && scope === 'instance' && imageMode !== 'keep') {
        throw new Error('定期予定の画像変更は「これ以降」または「繰り返し全体」で編集してください。');
    }
    const image = imageMode === 'replace' ? decodeImage(payload.image) : null;
    if (imageMode === 'replace' && !image) throw new Error('置き換える画像を選択してください。');

    if (scope === 'future') {
        return updateFutureSchedule(guildId, payload, resolved, targetType, start, imageMode, image);
    }

    const existingPrivate = resolved.target.extendedProperties?.private || {};
    const oldAssetId = existingPrivate.reactusAssetId || null;
    let newAssetId = null;
    try {
        if (image) newAssetId = await storeCalendarPostImageBuffer(guildId, image);
        const privateProperties = privatePropertiesForUpdate(existingPrivate, payload, imageMode, newAssetId);
        const requestBody = buildRequestBody({
            targetType,
            payload,
            start,
            monitor: resolved.monitor,
            privateProperties,
            recurrenceIncluded: recurrenceAllowed,
            recurrence,
        });

        let updated;
        try {
            updated = (await resolved.calendar.events.patch({
                calendarId: resolved.calendarId,
                eventId: resolved.target.id,
                requestBody,
            })).data;
        } catch (error) {
            if (error?.code === 403) throw new Error(permissionHelp(resolved.auth, resolved.calendarId));
            if (error?.code === 404) throw new Error('編集対象の予定が見つかりません。');
            throw error;
        }

        if (imageMode !== 'keep' && oldAssetId) {
            await deleteCalendarPostImage(oldAssetId, guildId).catch(() => {});
        }
        return updated;
    } catch (error) {
        if (newAssetId) await deleteCalendarPostImage(newAssetId, guildId).catch(() => {});
        throw error;
    }
}
