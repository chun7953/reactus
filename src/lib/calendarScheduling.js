const CONTROL_NO_DEFAULT_MENTION = '[[reactus:no-default-mention]]';
const CONTROL_ROLE_PREFIX = '[[reactus:mention-role:';

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

export function buildRecurrence(repeat = 'once', repeatUntil = null) {
    if (!repeat || repeat === 'once') return null;

    const mapping = {
        daily: 'FREQ=DAILY',
        weekly: 'FREQ=WEEKLY',
        biweekly: 'FREQ=WEEKLY;INTERVAL=2',
        monthly: 'FREQ=MONTHLY',
    };
    const base = mapping[repeat];
    if (!base) throw new Error(`Unsupported recurrence: ${repeat}`);

    let until = '';
    if (repeatUntil) {
        const match = repeatUntil.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (!match) throw new Error('repeat_until must be YYYY-MM-DD');
        const [, year, month, day] = match;
        const endOfDayJst = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59+09:00`);
        if (Number.isNaN(endOfDayJst.getTime())) throw new Error('repeat_until is invalid');
        const stamp = endOfDayJst.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        until = `;UNTIL=${stamp}`;
    }
    return [`RRULE:${base}${until}`];
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
