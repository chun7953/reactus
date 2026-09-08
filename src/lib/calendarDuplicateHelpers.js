import { formatJstDateTime } from './calendarScheduling.js';

export function mergeDuplicatePrivateProperties(masterPrivate = {}, instancePrivate = {}) {
    const merged = {
        ...(masterPrivate || {}),
        ...(instancePrivate || {}),
    };
    if (merged.reactusMentionMode && merged.reactusMentionMode !== 'role') {
        delete merged.reactusMentionRoleId;
    }
    return merged;
}

export function buildDuplicatedEventBody(source, newStart, { assetId = null, fallbackSummary = '複製' } = {}) {
    const oldStart = new Date(source?.start?.dateTime || source?.start?.date);
    const oldEnd = new Date(source?.end?.dateTime || source?.end?.date);
    const start = newStart instanceof Date ? newStart : new Date(newStart);
    if (Number.isNaN(oldStart.getTime()) || Number.isNaN(oldEnd.getTime()) || oldEnd <= oldStart) {
        throw new Error('複製元の予定時間を読み取れません。');
    }
    if (Number.isNaN(start.getTime())) throw new Error('複製先の開始日時を読み取れません。');

    const end = new Date(start.getTime() + (oldEnd.getTime() - oldStart.getTime()));
    const privateProperties = { ...(source?.extendedProperties?.private || {}) };
    if (assetId) privateProperties.reactusAssetId = String(assetId);
    else delete privateProperties.reactusAssetId;

    return {
        summary: source?.summary || fallbackSummary,
        description: source?.description || '',
        start: { dateTime: formatJstDateTime(start), timeZone: 'Asia/Tokyo' },
        end: { dateTime: formatJstDateTime(end), timeZone: 'Asia/Tokyo' },
        extendedProperties: { private: privateProperties },
    };
}
