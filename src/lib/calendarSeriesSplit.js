function utcRRuleTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('繰り返し予定の基準日時を読み取れません。');
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function transformRRule(recurrence, transform) {
    const source = Array.isArray(recurrence) ? recurrence : [];
    let found = false;
    const result = source.map(line => {
        const text = String(line);
        if (!text.startsWith('RRULE:')) return text;
        found = true;
        const parts = text.slice(6).split(';').filter(Boolean);
        return `RRULE:${transform(parts).join(';')}`;
    });
    if (!found) throw new Error('繰り返しルールが見つかりません。');
    return result;
}

export function recurrenceBeforeTarget(recurrence, targetStart) {
    const target = targetStart instanceof Date ? targetStart : new Date(targetStart);
    if (Number.isNaN(target.getTime())) throw new Error('「これ以降」の開始日時を読み取れません。');
    const until = new Date(target.getTime() - 1000);
    return transformRRule(recurrence, parts => {
        const kept = parts.filter(part => !part.startsWith('UNTIL=') && !part.startsWith('COUNT='));
        kept.push(`UNTIL=${utcRRuleTimestamp(until)}`);
        return kept;
    });
}

export function recurrenceForRemainingCount(recurrence, skippedInstances) {
    const skipped = Number(skippedInstances || 0);
    if (!Number.isInteger(skipped) || skipped < 0) throw new Error('繰り返し回数を計算できません。');
    return transformRRule(recurrence, parts => parts.map(part => {
        if (!part.startsWith('COUNT=')) return part;
        const total = Number.parseInt(part.slice('COUNT='.length), 10);
        if (!Number.isInteger(total) || total < 1) return part;
        return `COUNT=${Math.max(1, total - skipped)}`;
    }));
}

export function recurringTargetStart(event) {
    const value = event?.originalStartTime?.dateTime
        || event?.originalStartTime?.date
        || event?.start?.dateTime
        || event?.start?.date;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('繰り返し予定の元の開始日時を読み取れません。');
    return date;
}

export function hasCountRule(recurrence) {
    return (Array.isArray(recurrence) ? recurrence : [])
        .some(line => /^RRULE:.*(?:^|;)COUNT=\d+(?:;|$)/.test(String(line)) || /(?:^|;)COUNT=\d+(?:;|$)/.test(String(line).slice(6)));
}
