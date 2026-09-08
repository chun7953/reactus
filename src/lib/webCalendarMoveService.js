import {
    getWebScheduleDetail,
    updateWebSchedule,
} from './webCalendarMentionService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error('移動先の日付が正しくありません。');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error('移動先の日付が正しくありません。');
    }
    return { year, month, day, timestamp };
}

function parseNaiveDateTime(value, label) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) throw new Error(`${label}を読み取れません。`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const timestamp = Date.UTC(year, month - 1, day, hour, minute);
    const date = new Date(timestamp);
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day ||
        date.getUTCHours() !== hour ||
        date.getUTCMinutes() !== minute
    ) {
        throw new Error(`${label}を読み取れません。`);
    }
    return { year, month, day, hour, minute, timestamp };
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatNaiveDateTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function buildMovedSchedulePayload(detail, newDate) {
    if (!detail || typeof detail !== 'object') throw new Error('移動する予定を読み取れません。');
    if (detail.originalWasRecurring || detail.recurringEventId || detail.isRecurringMaster) {
        throw new Error('定期予定はドラッグ移動できません。予定をクリックし、編集範囲を選択して変更してください。');
    }
    parseDateKey(newDate);

    const oldStart = parseNaiveDateTime(detail.startTime, '予定の開始日時');
    const oldEnd = parseNaiveDateTime(detail.endTime, '予定の終了日時');
    if (oldEnd.timestamp <= oldStart.timestamp) throw new Error('予定の開始・終了時刻を読み取れません。');

    const target = parseDateKey(newDate);
    const newStart = Date.UTC(target.year, target.month - 1, target.day, oldStart.hour, oldStart.minute);
    const duration = oldEnd.timestamp - oldStart.timestamp;
    const payload = {
        calendarId: detail.calendarId,
        eventId: detail.requestedEventId || detail.id,
        scope: 'instance',
        monitorId: detail.monitorId,
        type: detail.type,
        startTime: formatNaiveDateTime(newStart),
        mention: detail.mention || { mode: 'default' },
        imageMode: 'keep',
        recurrence: { unit: 'once', interval: 1 },
    };

    if (detail.type === 'giveaway') {
        return {
            ...payload,
            endTime: formatNaiveDateTime(newStart + duration),
            prizes: detail.prizes || [],
            message: detail.message || '',
        };
    }

    if (detail.type !== 'post') throw new Error('移動できない予定の種類です。');
    return {
        ...payload,
        title: detail.title || '',
        body: detail.body || '',
        durationMinutes: Math.max(1, Math.round(duration / 60000)),
    };
}

export async function moveWebSchedule(guildId, request) {
    const calendarId = String(request?.calendarId || '').trim();
    const eventId = String(request?.eventId || '').trim();
    if (!calendarId || !eventId) throw new Error('移動する予定を特定できません。');

    const detail = await getWebScheduleDetail(guildId, {
        calendarId,
        eventId,
        scope: 'instance',
    });
    const payload = buildMovedSchedulePayload(detail, request?.newDate);
    return updateWebSchedule(guildId, payload);
}

export { formatNaiveDateTime, parseDateKey, parseNaiveDateTime, DAY_MS };
