import { parseGiveawayDescription, parseTriggeredSummary } from './calendarEditHelpers.js';

const FREQUENCY_TO_UNIT = {
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
};

function jstDateParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function formatWebDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('予定日時を読み取れません。');
    const parts = jstDateParts(date);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function untilToJstDate(value) {
    const match = String(value || '').match(/^(\d{8})T\d{6}Z$/);
    if (!match) return null;
    const raw = match[1];
    const date = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    // RRULE UNTIL is stored in UTC. The recurrence builder uses JST end-of-day,
    // so convert the actual instant back to the date observed in JST.
    const instant = new Date(String(value).replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        '$1-$2-$3T$4:$5:$6Z',
    ));
    if (Number.isNaN(instant.getTime())) return null;
    const parts = jstDateParts(instant);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseWebRecurrence(recurrence = []) {
    const rrule = (recurrence || []).find(line => String(line).startsWith('RRULE:'));
    if (!rrule) return { unit: 'once', interval: 1 };

    const values = Object.fromEntries(
        String(rrule)
            .slice('RRULE:'.length)
            .split(';')
            .map(part => {
                const index = part.indexOf('=');
                return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
            }),
    );
    const unit = FREQUENCY_TO_UNIT[values.FREQ];
    if (!unit) return { unit: 'once', interval: 1 };

    const result = {
        unit,
        interval: Math.max(1, Number.parseInt(values.INTERVAL || '1', 10) || 1),
    };

    if (unit === 'week' && values.BYDAY) {
        result.weekdays = values.BYDAY.split(',').filter(Boolean);
    }

    if (unit === 'month') {
        if (values.BYMONTHDAY) {
            const day = Number.parseInt(values.BYMONTHDAY, 10);
            if (Number.isInteger(day)) result.monthlyDay = day;
        }
        if (values.BYDAY) {
            const ordinalMatch = values.BYDAY.match(/^(-?\d+)(SU|MO|TU|WE|TH|FR|SA)$/);
            if (ordinalMatch) {
                const ordinal = Number(ordinalMatch[1]);
                result.monthlyWeek = ordinal === -1
                    ? 'last'
                    : ({ 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' }[ordinal] || null);
                result.monthlyWeekday = ordinalMatch[2];
            }
        }
    }

    if (values.COUNT) {
        const count = Number.parseInt(values.COUNT, 10);
        if (Number.isInteger(count) && count > 0) result.count = count;
    } else if (values.UNTIL) {
        const until = untilToJstDate(values.UNTIL);
        if (until) result.until = until;
    }
    return result;
}

export function webScheduleDetail(event, monitor) {
    const parsedSummary = parseTriggeredSummary(event.summary || '');
    const start = new Date(event.start?.dateTime || event.start?.date);
    const end = new Date(event.end?.dateTime || event.end?.date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new Error('予定の開始・終了時刻を読み取れません。');
    }

    const privateProperties = event.extendedProperties?.private || {};
    const mentionMode = ['default', 'none', 'role'].includes(privateProperties.reactusMentionMode)
        ? privateProperties.reactusMentionMode
        : 'default';
    const type = parsedSummary.trigger === 'ラキショ' ? 'giveaway' : 'post';
    const base = {
        id: event.id,
        calendarId: monitor.calendar_id,
        monitorId: monitor.id,
        channelId: monitor.channel_id,
        triggerKeyword: parsedSummary.trigger,
        type,
        startTime: formatWebDateTime(start),
        endTime: formatWebDateTime(end),
        recurrence: parseWebRecurrence(event.recurrence || []),
        isRecurringMaster: Boolean(event.recurrence?.length),
        recurringEventId: event.recurringEventId || null,
        mention: {
            mode: mentionMode,
            roleId: privateProperties.reactusMentionRoleId || null,
        },
        hasImage: Boolean(privateProperties.reactusAssetId),
    };

    if (type === 'giveaway') {
        const parsed = parseGiveawayDescription(event.description || '');
        return {
            ...base,
            prizes: parsed.prizes.map(item => ({ name: item.prize, winners: item.winners })),
            message: parsed.message,
        };
    }

    return {
        ...base,
        title: parsedSummary.title,
        body: event.description || '',
        durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
    };
}
