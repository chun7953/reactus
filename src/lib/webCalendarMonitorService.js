import { google } from 'googleapis';
import { ensureCalendarClaim } from './calendarClaimService.js';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { get, getDBPool } from './settingsCache.js';
import { invalidateWebScheduleCache } from './webCalendarAdmin.js';

const MAX_MONITORS_PER_GUILD = 100;
const MAX_TRIGGER_LENGTH = 100;

function cleanTrigger(value) {
    return String(value || '')
        .replace(/[【】]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .trim();
}

function normalizeCalendarId(value) {
    const calendarId = String(value || '').trim();
    if (!calendarId) throw new Error('GoogleカレンダーIDを入力してください。');
    if (calendarId.length > 512) throw new Error('GoogleカレンダーIDが長すぎます。');
    return calendarId;
}

function normalizeMonitorPayload(payload, guild) {
    const channelId = String(payload?.channelId || '').trim();
    const triggerKeyword = cleanTrigger(payload?.triggerKeyword);
    const calendarId = normalizeCalendarId(payload?.calendarId);
    const mentionRoleId = String(payload?.mentionRoleId || '').trim() || null;

    if (!/^\d+$/.test(channelId)) throw new Error('投稿先チャンネルを選択してください。');
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased?.() || channel?.isDMBased?.()) {
        throw new Error('Discordサーバー内のテキストチャンネルを選択してください。');
    }

    if (!triggerKeyword) throw new Error('予定を見分ける合図（キーワード）を入力してください。');
    if (triggerKeyword.length > MAX_TRIGGER_LENGTH) {
        throw new Error(`予定を見分ける合図は${MAX_TRIGGER_LENGTH}文字以内にしてください。`);
    }

    if (mentionRoleId) {
        if (!/^\d+$/.test(mentionRoleId)) throw new Error('既定メンションロールを選択してください。');
        const role = guild.roles.cache.get(mentionRoleId);
        if (!role || role.id === guild.id) throw new Error('このサーバーのロールを選択してください。');
    }

    return { channelId, calendarId, triggerKeyword, mentionRoleId };
}

function publicMonitor(row) {
    return {
        id: row.id,
        channelId: row.channel_id,
        calendarId: row.calendar_id,
        triggerKeyword: cleanTrigger(row.trigger_keyword),
        mentionRoleId: row.mention_role || null,
    };
}

async function verifyCalendarAccess(calendarId) {
    const { auth } = await initializeSheetsAPI();
    const calendar = google.calendar({ version: 'v3', auth });
    try {
        // The app's calendar.events scope can verify that Reactus can read the
        // calendar without creating a probe event. Actual write permission is
        // still enforced when a schedule is created or edited.
        await calendar.events.list({
            calendarId,
            maxResults: 1,
            singleEvents: true,
            timeMin: new Date().toISOString(),
        });
    } catch (error) {
        if (error?.code === 403 || error?.code === 404) {
            const account = auth?.email ? ` サービスアカウント: ${auth.email}` : '';
            throw new Error(`カレンダー ${calendarId} にアクセスできません。Googleカレンダーの共有設定でReactusのサービスアカウントを追加してください。予定の作成・編集には「予定の変更」権限が必要です。${account}`);
        }
        throw error;
    }
}

function friendlyDatabaseError(error) {
    if (error?.code === '23505') {
        return new Error('同じ投稿先チャンネルとトリガーキーワードの設定が既にあります。');
    }
    return error;
}

export async function setWebMainCalendar(guildId, calendarId) {
    const normalized = normalizeCalendarId(calendarId);
    await ensureCalendarClaim(guildId, normalized, { allowChallenge: true });
    await verifyCalendarAccess(normalized);
    const pool = await getDBPool();
    await pool.query(
        `INSERT INTO guild_configs (guild_id, main_calendar_id)
         VALUES ($1, $2)
         ON CONFLICT (guild_id)
         DO UPDATE SET main_calendar_id = EXCLUDED.main_calendar_id`,
        [guildId, normalized],
    );
    return { mainCalendarId: normalized };
}

export async function clearWebMainCalendar(guildId) {
    const pool = await getDBPool();
    await pool.query(
        `INSERT INTO guild_configs (guild_id, main_calendar_id)
         VALUES ($1, NULL)
         ON CONFLICT (guild_id)
         DO UPDATE SET main_calendar_id = NULL`,
        [guildId],
    );
    return { mainCalendarId: null };
}

export async function createWebCalendarMonitor(guildId, payload, guild, { allowChallenge = false } = {}) {
    const monitor = normalizeMonitorPayload(payload, guild);
    const existing = await get.monitorsByGuild(guildId);
    if (existing.length >= MAX_MONITORS_PER_GUILD) {
        throw new Error(`このサーバーで登録できるカレンダー監視設定は最大${MAX_MONITORS_PER_GUILD}件です。`);
    }
    await ensureCalendarClaim(guildId, monitor.calendarId, { allowChallenge });
    await verifyCalendarAccess(monitor.calendarId);

    const pool = await getDBPool();
    try {
        const result = await pool.query(
            `INSERT INTO calendar_monitors
                (guild_id, channel_id, calendar_id, trigger_keyword, mention_role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [guildId, monitor.channelId, monitor.calendarId, monitor.triggerKeyword, monitor.mentionRoleId],
        );
        invalidateWebScheduleCache(guildId);
        return publicMonitor(result.rows[0]);
    } catch (error) {
        throw friendlyDatabaseError(error);
    }
}

export async function updateWebCalendarMonitor(guildId, payload, guild, { allowChallenge = false } = {}) {
    const monitorId = Number(payload?.id);
    if (!Number.isInteger(monitorId) || monitorId < 1) throw new Error('編集するカレンダー設定を特定できません。');
    const monitor = normalizeMonitorPayload(payload, guild);
    await ensureCalendarClaim(guildId, monitor.calendarId, { allowChallenge });
    await verifyCalendarAccess(monitor.calendarId);

    const pool = await getDBPool();
    try {
        const result = await pool.query(
            `UPDATE calendar_monitors
             SET channel_id = $1,
                 calendar_id = $2,
                 trigger_keyword = $3,
                 mention_role = $4
             WHERE id = $5 AND guild_id = $6
             RETURNING *`,
            [monitor.channelId, monitor.calendarId, monitor.triggerKeyword, monitor.mentionRoleId, monitorId, guildId],
        );
        if (result.rowCount === 0) throw new Error('編集するカレンダー設定が見つかりません。');
        invalidateWebScheduleCache(guildId);
        return publicMonitor(result.rows[0]);
    } catch (error) {
        throw friendlyDatabaseError(error);
    }
}

export async function deleteWebCalendarMonitor(guildId, payload) {
    const monitorId = Number(payload?.id);
    if (!Number.isInteger(monitorId) || monitorId < 1) throw new Error('削除するカレンダー設定を特定できません。');
    const pool = await getDBPool();
    const result = await pool.query(
        'DELETE FROM calendar_monitors WHERE id = $1 AND guild_id = $2 RETURNING *',
        [monitorId, guildId],
    );
    if (result.rowCount === 0) throw new Error('削除するカレンダー設定が見つかりません。');
    invalidateWebScheduleCache(guildId);
    return { deleted: true, monitor: publicMonitor(result.rows[0]) };
}

export async function currentMainCalendar(guildId) {
    const config = await get.guildConfig(guildId);
    return config?.main_calendar_id || null;
}

export { cleanTrigger, normalizeMonitorPayload };