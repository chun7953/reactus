import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { get } from './settingsCache.js';
import { parseJstDateTime } from './calendarScheduling.js';
import { parseTriggeredSummary } from './calendarEditHelpers.js';
import { cloneCalendarPostImage, deleteCalendarPostImage } from './calendarPostAssets.js';
import {
    buildDuplicatedEventBody,
    mergeDuplicatePrivateProperties,
} from './calendarDuplicateHelpers.js';

function cleanKeyword(value) {
    return String(value || '').replace(/[【】]/g, '').trim();
}

function parseRequiredDateTime(value) {
    const result = parseJstDateTime(String(value || '').replace('T', ' '));
    if (!result) throw new Error('複製先の開始日時を正しく入力してください。');
    return result;
}

function permissionHelp(auth, calendarId) {
    const email = auth?.email ? ` サービスアカウント: ${auth.email}` : '';
    return `カレンダー ${calendarId} に予定を書き込めません。GoogleカレンダーでReactusのサービスアカウントに「予定の変更」権限を付けてください。${email}`;
}

async function effectivePrivateProperties(calendar, calendarId, source) {
    const instancePrivate = source.extendedProperties?.private || {};
    if (!source.recurringEventId) return instancePrivate;

    try {
        const master = (await calendar.events.get({ calendarId, eventId: source.recurringEventId })).data;
        return mergeDuplicatePrivateProperties(
            master.extendedProperties?.private || {},
            instancePrivate,
        );
    } catch (error) {
        if (error?.code === 404) return instancePrivate;
        throw error;
    }
}

export async function duplicateWebSchedule(guildId, { calendarId, eventId, startTime }) {
    if (!calendarId || !eventId) throw new Error('複製元の予定を特定できません。');
    const newStart = parseRequiredDateTime(startTime);
    const monitors = await get.monitorsByGuild(guildId);
    const calendarMonitors = monitors.filter(monitor => monitor.calendar_id === calendarId);
    if (!calendarMonitors.length) throw new Error('このカレンダーを操作する権限がありません。');

    const { auth } = await initializeSheetsAPI();
    const calendar = google.calendar({ version: 'v3', auth });
    let source;
    try {
        source = (await calendar.events.get({ calendarId, eventId })).data;
    } catch (error) {
        if (error?.code === 403) throw new Error(permissionHelp(auth, calendarId));
        if (error?.code === 404) throw new Error('複製元の予定が見つかりません。');
        throw error;
    }

    const trigger = parseTriggeredSummary(source.summary || '').trigger;
    const monitor = calendarMonitors.find(candidate => cleanKeyword(candidate.trigger_keyword) === trigger);
    if (!monitor) throw new Error('Reactusが管理している予定ではありません。');

    let sourcePrivate;
    try {
        sourcePrivate = await effectivePrivateProperties(calendar, calendarId, source);
    } catch (error) {
        if (error?.code === 403) throw new Error(permissionHelp(auth, calendarId));
        throw error;
    }
    const sourceAssetId = sourcePrivate.reactusAssetId || null;
    const sourceWithEffectiveMetadata = {
        ...source,
        extendedProperties: {
            ...(source.extendedProperties || {}),
            private: sourcePrivate,
        },
    };

    let clonedAssetId = null;
    try {
        if (sourceAssetId) {
            clonedAssetId = await cloneCalendarPostImage(guildId, sourceAssetId);
            if (!clonedAssetId) throw new Error('複製元の画像を読み込めませんでした。');
        }

        const requestBody = buildDuplicatedEventBody(sourceWithEffectiveMetadata, newStart, {
            assetId: clonedAssetId,
            fallbackSummary: `【${cleanKeyword(monitor.trigger_keyword)}】複製`,
        });

        const response = await calendar.events.insert({ calendarId, requestBody });
        return response.data;
    } catch (error) {
        if (clonedAssetId) await deleteCalendarPostImage(clonedAssetId).catch(() => {});
        if (error?.code === 403 || error?.code === 404) throw new Error(permissionHelp(auth, calendarId));
        throw error;
    }
}
