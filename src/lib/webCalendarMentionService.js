import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { get } from './settingsCache.js';
import {
    createWebSchedule as createBaseSchedule,
    deleteWebSchedule,
} from './webCalendarAdmin.js';
import {
    getWebScheduleDetail as getBaseScheduleDetail,
    updateWebSchedule as updateBaseSchedule,
} from './webCalendarEditService.js';
import {
    applyMentionPrivateProperties,
    mentionToken,
    normalizeMentionConfig,
} from './calendarMentions.js';

const TOKEN_PATTERN = /<@&\d+>|<@\d+>|<@everyone>|<@here>|@everyone|@here/g;

function normalizeToken(token) {
    if (token === '<@everyone>') return '@everyone';
    if (token === '<@here>') return '@here';
    return token;
}

function targetFromToken(token) {
    const normalized = normalizeToken(token);
    const role = normalized.match(/^<@&(\d+)>$/);
    if (role) return { type: 'role', id: role[1] };
    const user = normalized.match(/^<@(\d+)>$/);
    if (user) return { type: 'user', id: user[1] };
    if (normalized === '@everyone') return { type: 'everyone' };
    if (normalized === '@here') return { type: 'here' };
    return null;
}

function targetKey(target) {
    return target?.id ? `${target.type}:${target.id}` : target?.type;
}

function uniqueTargets(targets = []) {
    const seen = new Set();
    const result = [];
    for (const target of targets) {
        if (!target) continue;
        const key = targetKey(target);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(target);
    }
    return result;
}

function extractTargets(text = '') {
    const raw = String(text || '');
    const matches = raw.match(TOKEN_PATTERN) || [];
    const targets = uniqueTargets(matches.map(targetFromToken));
    const cleaned = raw.replace(TOKEN_PATTERN, '').replace(/[ \t]+\n/g, '\n').trim();
    return { cleaned, targets };
}

function appendTargets(text, targets = []) {
    const raw = String(text || '').trim();
    const existing = extractTargets(raw).targets;
    const existingKeys = new Set(existing.map(targetKey));
    const tokens = [];
    for (const target of targets) {
        if (existingKeys.has(targetKey(target))) continue;
        const token = mentionToken(target);
        if (token) tokens.push(token);
    }
    return [raw, tokens.join(' ')].filter(Boolean).join('\n');
}

async function monitorFor(guildId, monitorId) {
    const monitors = await get.monitorsByGuild(guildId);
    return monitors.find(item => String(item.id) === String(monitorId)) || null;
}

async function patchMentionMetadata(guildId, monitorId, event, mention) {
    const monitor = await monitorFor(guildId, monitorId);
    if (!monitor) throw new Error('投稿先のカレンダー設定が見つかりません。');
    const { auth } = await initializeSheetsAPI();
    const calendar = google.calendar({ version: 'v3', auth });
    const privateProperties = applyMentionPrivateProperties(
        event.extendedProperties?.private || {},
        mention,
    );
    return (await calendar.events.patch({
        calendarId: monitor.calendar_id,
        eventId: event.id,
        requestBody: { extendedProperties: { private: privateProperties } },
    })).data;
}

function payloadWithRichMention(payload) {
    const mention = normalizeMentionConfig(payload?.mention || {});
    if (mention.mode !== 'custom') return { payload, mention };

    const next = {
        ...payload,
        mention: { mode: 'none' },
    };
    if (payload?.type === 'giveaway') {
        next.message = appendTargets(payload.message, mention.targets);
    } else {
        next.body = appendTargets(payload.body, mention.targets);
    }
    return { payload: next, mention };
}

export async function createWebSchedule(guildId, payload) {
    const transformed = payloadWithRichMention(payload);
    const event = await createBaseSchedule(guildId, transformed.payload);
    if (transformed.mention.mode !== 'custom') return event;

    try {
        return await patchMentionMetadata(guildId, payload.monitorId, event, transformed.mention);
    } catch (error) {
        const monitor = await monitorFor(guildId, payload.monitorId);
        if (monitor) {
            await deleteWebSchedule(guildId, {
                calendarId: monitor.calendar_id,
                eventId: event.id,
                scope: 'instance',
            }).catch(() => {});
        }
        throw error;
    }
}

export async function updateWebSchedule(guildId, payload) {
    const transformed = payloadWithRichMention(payload);
    const event = await updateBaseSchedule(guildId, transformed.payload);
    // Always rewrite the rich-mention metadata after an edit. This also
    // removes stale reactusMentionTargets when switching back to default/none.
    return patchMentionMetadata(guildId, payload.monitorId, event, transformed.mention);
}

export async function getWebScheduleDetail(guildId, request) {
    const detail = await getBaseScheduleDetail(guildId, request);
    const field = detail.type === 'giveaway' ? 'message' : 'body';
    const extracted = extractTargets(detail[field] || '');
    detail[field] = extracted.cleaned;

    // Structured metadata is authoritative, while explicit tokens in legacy or
    // manually edited descriptions are also preserved. Merge both and dedupe.
    let targets = [
        ...(detail.mention?.mode === 'custom' ? (detail.mention.targets || []) : []),
        ...extracted.targets,
    ];

    // Compatibility with detail objects produced by older code paths.
    if (detail.mention?.mode === 'role' && detail.mention.roleId) {
        targets.push({ type: 'role', id: String(detail.mention.roleId) });
    }

    // A legacy/default event can combine the monitor default role with explicit
    // mentions in its description. Preserve the exact delivery result when it
    // is first opened in the structured editor.
    if (targets.length && detail.mention?.mode === 'default') {
        const monitor = await monitorFor(guildId, detail.monitorId);
        if (monitor?.mention_role) targets.unshift({ type: 'role', id: String(monitor.mention_role) });
    }

    targets = uniqueTargets(targets);
    if (targets.length) {
        detail.mention = { mode: 'custom', targets };
    }
    return detail;
}
