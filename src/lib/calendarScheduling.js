const CONTROL_NO_DEFAULT_MENTION = '[[reactus:no-default-mention]]';
const CONTROL_ROLE_PREFIX = '[[reactus:mention-role:';

const WEEKDAY_ALIASES = new Map([
    ['su', 'SU'], ['sun', 'SU'], ['sunday', 'SU'], ['日', 'SU'], ['日曜', 'SU'], ['日曜日', 'SU'],
    ['mo', 'MO'], ['mon', 'MO'], ['monday', 'MO'], ['月', 'MO'], ['月曜', 'MO'], ['月曜日', 'MO'],
    ['tu', 'TU'], ['tue', 'TU'], ['tues', 'TU'], ['tuesday', 'TU'], ['火', 'TU'], ['火曜', 'TU'], ['火曜日', 'TU'],
    ['we', 'WE'], ['wed', 'WE'], ['wednesday', 'WE'], ['水', 'WE'], ['水曜', 'WE'], ['水曜日', 'WE'],
    ['th', 'TH'], ['thu', 'TH'], ['thur', 'TH'], ['thurs', 'TH'], ['thursday', 'TH'], ['木', 'TH'], ['木曜', 'TH'], ['木曜日', 'TH'],
    ['fr', 'FR'], ['fri', 'FR'], ['friday', 'FR'], ['金', 'FR'], ['金曜', 'FR'], ['金曜日', 'FR'],
    ['sa', 'SA'], ['sat', 'SA'], ['saturday', 'SA'], ['土', 'SA'], ['土曜', 'SA'], ['土曜日', 'SA'],
]);

export function parseJstDateTime(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const [, year, month, day, hour, minute] = match;
    const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const actual = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (
        actual.year !== year
        || actual.month !== month.padStart(2, '0')
        || actual.day !== day.padStart(2, '0')
        || actual.hour !== hour.padStart(2, '0')
        || actual.minute !== minute
    ) return null;

    return date;
}

export function formatJstDateTime(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}+09:00`;
}

function parseRepeatUntil(value) {
    const match = String(value || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!match) throw new Error('repeat_until must be YYYY-MM-DD');
    const [, year, month, day] = match;
    const endOfDayJst = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59+09:00`);
    if (Number.isNaN(endOfDayJst.getTime())) throw new Error('repeat_until is invalid');
    return endOfDayJst;
}

export function parseWeekdays(value) {
    if (!value) return [];
    const normalized = String(value)
        .replace(/[、，]/g, ',')
        .split(/[\s,\/]+/)
        .map(token => token.trim().toLowerCase())
        .filter(Boolean);
    const days = [];
    for (const token of normalized) {
        const day = WEEKDAY_ALIASES.get(token);
        if (!day) throw new Error(`曜日「${token}」を解釈できません。例: 月,水,金 または mon,wed,fri`);
        if (!days.includes(day)) days.push(day);
    }
    return days;
}

function startWeekday(start) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        weekday: 'short',
    }).format(start).toLowerCase();
    return WEEKDAY_ALIASES.get(parts);
}

function normalizeMonthlyWeek(value) {
    if (!value) return null;
    const mapping = {
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
        last: -1,
    };
    const result = mapping[value];
    if (!result) throw new Error(`Unsupported monthly_week: ${value}`);
    return result;
}

export function buildRecurrence({
    unit = 'once',
    interval = 1,
    weekdays = null,
    monthlyDay = null,
    monthlyWeek = null,
    monthlyWeekday = null,
    until = null,
    count = null,
    start = null,
} = {}) {
    if (!unit || unit === 'once') {
        if (until || count || interval !== 1 || weekdays || monthlyDay || monthlyWeek || monthlyWeekday) {
            throw new Error('繰り返しなしでは繰り返し詳細を指定できません。');
        }
        return null;
    }

    const frequencies = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' };
    const frequency = frequencies[unit];
    if (!frequency) throw new Error(`Unsupported recurrence unit: ${unit}`);
    if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
        throw new Error('繰り返し間隔は1〜99で指定してください。');
    }
    if (until && count) throw new Error('繰り返しの終了日は、終了日と回数のどちらか一方だけ指定してください。');
    if (count !== null && count !== undefined && (!Number.isInteger(count) || count < 1 || count > 999)) {
        throw new Error('繰り返し回数は1〜999で指定してください。');
    }

    const parts = [`FREQ=${frequency}`];
    if (interval > 1) parts.push(`INTERVAL=${interval}`);

    if (unit === 'week') {
        const byDays = parseWeekdays(weekdays);
        if (byDays.length > 0) parts.push(`BYDAY=${byDays.join(',')}`);
    } else if (weekdays) {
        throw new Error('曜日指定は「週」単位の繰り返しで使用してください。');
    }

    if (unit === 'month') {
        if (monthlyDay !== null && monthlyDay !== undefined && monthlyWeek) {
            throw new Error('毎月の日付指定と「第○曜日」は同時に指定できません。');
        }
        if (monthlyDay !== null && monthlyDay !== undefined) {
            if (!Number.isInteger(monthlyDay) || monthlyDay === 0 || monthlyDay < -1 || monthlyDay > 31) {
                throw new Error('毎月の日付は1〜31、または月末を表す -1 を指定してください。');
            }
            parts.push(`BYMONTHDAY=${monthlyDay}`);
        }
        if (monthlyWeek) {
            const ordinal = normalizeMonthlyWeek(monthlyWeek);
            const day = monthlyWeekday
                ? parseWeekdays(monthlyWeekday)[0]
                : (start ? startWeekday(start) : null);
            if (!day) throw new Error('第○曜日指定には曜日が必要です。');
            parts.push(`BYDAY=${ordinal}${day}`);
        } else if (monthlyWeekday) {
            throw new Error('monthly_weekday を使う場合は monthly_week も指定してください。');
        }
    } else if (monthlyDay || monthlyWeek || monthlyWeekday) {
        throw new Error('毎月の詳細指定は「月」単位の繰り返しで使用してください。');
    }

    if (until) {
        const endOfDayJst = parseRepeatUntil(until);
        if (start && endOfDayJst < start) throw new Error('繰り返し終了日は開始日以降にしてください。');
        parts.push(`UNTIL=${endOfDayJst.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`);
    } else if (count) {
        parts.push(`COUNT=${count}`);
    }

    return [`RRULE:${parts.join(';')}`];
}

export function buildMentionControlLines({ mention = null, mentionRoleId = null } = {}) {
    if (mention === false) return [CONTROL_NO_DEFAULT_MENTION];
    if (mentionRoleId) {
        return [CONTROL_NO_DEFAULT_MENTION, `${CONTROL_ROLE_PREFIX}${mentionRoleId}]]`];
    }
    return [];
}

export function parseCalendarDescription(description = '') {
    const roleIds = new Set();
    let suppressDefaultMention = false;
    const bodyLines = [];

    for (const line of String(description).split('\n')) {
        const trimmed = line.trim();
        if (trimmed === CONTROL_NO_DEFAULT_MENTION) {
            suppressDefaultMention = true;
            continue;
        }
        const roleMatch = trimmed.match(/^\[\[reactus:mention-role:(\d+)\]\]$/);
        if (roleMatch) {
            suppressDefaultMention = true;
            roleIds.add(roleMatch[1]);
            continue;
        }
        bodyLines.push(line);
    }

    return {
        body: bodyLines.join('\n').trim(),
        suppressDefaultMention,
        mentionRoleIds: [...roleIds],
    };
}

export function composeCalendarDescription(body, controlLines = []) {
    return [String(body || '').trim(), ...controlLines].filter(Boolean).join('\n');
}
