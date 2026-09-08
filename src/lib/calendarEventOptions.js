const VISIBILITY = new Set(['default', 'public', 'private', 'confidential']);
const TRANSPARENCY = new Set(['opaque', 'transparent']);
const REMINDER_METHODS = new Set(['popup', 'email']);

function cleanText(value, maxLength, label) {
    const text = String(value || '').trim();
    if (text.length > maxLength) throw new Error(`${label}が長すぎます。`);
    return text;
}

export function normalizeCalendarEventOptions(input) {
    if (input === null || input === undefined) return null;
    const visibility = input.visibility || 'default';
    const transparency = input.transparency || 'opaque';
    if (!VISIBILITY.has(visibility)) throw new Error('Googleカレンダーの公開範囲が正しくありません。');
    if (!TRANSPARENCY.has(transparency)) throw new Error('Googleカレンダーの予定あり/空き設定が正しくありません。');

    const reminderMode = input.reminders?.mode || 'default';
    if (!['default', 'none', 'custom'].includes(reminderMode)) {
        throw new Error('Googleカレンダーのリマインダー設定が正しくありません。');
    }

    const result = {
        location: cleanText(input.location, 1024, '場所'),
        visibility,
        transparency,
        reminders: { mode: reminderMode, overrides: [] },
    };

    if (reminderMode === 'custom') {
        const raw = Array.isArray(input.reminders?.overrides) ? input.reminders.overrides : [];
        if (raw.length < 1) throw new Error('カスタムリマインダーを1件以上追加してください。');
        if (raw.length > 5) throw new Error('カスタムリマインダーは最大5件までです。');
        result.reminders.overrides = raw.map((item, index) => {
            const method = String(item?.method || 'popup');
            const minutes = Number(item?.minutes);
            if (!REMINDER_METHODS.has(method)) throw new Error(`リマインダー${index + 1}の方法が正しくありません。`);
            if (!Number.isInteger(minutes) || minutes < 0 || minutes > 40320) {
                throw new Error(`リマインダー${index + 1}は0〜40320分前で指定してください。`);
            }
            return { method, minutes };
        });
    }
    return result;
}

export function calendarEventOptionsRequest(input) {
    const options = normalizeCalendarEventOptions(input);
    if (!options) return {};
    let reminders;
    if (options.reminders.mode === 'default') {
        reminders = { useDefault: true };
    } else if (options.reminders.mode === 'none') {
        reminders = { useDefault: false, overrides: [] };
    } else {
        reminders = { useDefault: false, overrides: options.reminders.overrides };
    }
    return {
        location: options.location,
        visibility: options.visibility,
        transparency: options.transparency,
        reminders,
    };
}

export function calendarEventOptionsDetail(event = {}) {
    const reminders = event.reminders || {};
    let reminderMode = 'default';
    let overrides = [];
    if (reminders.useDefault === false) {
        overrides = Array.isArray(reminders.overrides)
            ? reminders.overrides
                .filter(item => REMINDER_METHODS.has(item?.method) && Number.isInteger(item?.minutes))
                .map(item => ({ method: item.method, minutes: item.minutes }))
            : [];
        reminderMode = overrides.length ? 'custom' : 'none';
    }
    return {
        location: event.location || '',
        visibility: VISIBILITY.has(event.visibility) ? event.visibility : 'default',
        transparency: TRANSPARENCY.has(event.transparency) ? event.transparency : 'opaque',
        reminders: { mode: reminderMode, overrides },
    };
}
