import { PermissionsBitField } from 'discord.js';
import config from '../config.js';
import { get } from '../lib/settingsCache.js';
import { triggerAutoBackup } from '../lib/autoBackup.js';
import {
    consumeWebAdminLogin,
    getWebAdminSession,
    revokeWebAdminSession,
} from '../lib/webAdminAuth.js';
import {
    deleteWebSchedule,
    listWebSchedules,
} from '../lib/webCalendarAdmin.js';
import {
    createWebSchedule,
    getWebScheduleDetail,
    updateWebSchedule,
} from '../lib/webCalendarMentionService.js';
import { duplicateWebSchedule } from '../lib/webCalendarDuplicateService.js';
import { moveWebSchedule } from '../lib/webCalendarMoveService.js';
import {
    clearWebMainCalendar,
    createWebCalendarMonitor,
    currentMainCalendar,
    deleteWebCalendarMonitor,
    setWebMainCalendar,
    updateWebCalendarMonitor,
} from '../lib/webCalendarMonitorService.js';
import {
    deleteWebAnnouncement,
    listWebAnnouncements,
    saveWebAnnouncement,
} from '../lib/webAnnouncementService.js';
import {
    createWebReactionRule,
    deleteWebReactionRule,
    guildEmojiPayload,
    listWebReactionRules,
    updateWebReactionRule,
} from '../lib/webAdminExtrasService.js';

const SESSION_COOKIE = 'reactus_admin';
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const ADMIN_AUTHORIZE_TIMEOUT_MS = 8000;
const ADMIN_BOOTSTRAP_TIMEOUT_MS = 8000;

function parseCookies(header) {
    const result = {};
    for (const part of String(header || '').split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) result[key] = decodeURIComponent(value);
    }
    return result;
}

function sendJson(req, res, statusCode, body) {
    const content = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : content);
}

function redirect(res, location, headers = {}) {
    res.writeHead(303, {
        Location: location,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        ...headers,
    });
    res.end();
}

function sessionCookie(token, maxAgeSeconds) {
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function timeoutError(message) {
    const error = new Error(message);
    error.statusCode = 503;
    return error;
}

async function withTimeout(promise, timeoutMs, message) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve(promise),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(timeoutError(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_JSON_BYTES) {
            const error = new Error('送信データが大きすぎます。画像は8MB以下にしてください。');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const error = new Error('送信内容を読み取れませんでした。');
        error.statusCode = 400;
        throw error;
    }
}

function verifyOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        return new URL(origin).origin === new URL(config.web.publicBaseUrl).origin;
    } catch {
        return false;
    }
}

async function authorize(req, client) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const session = await getWebAdminSession(token);
    if (!session) return null;
    if (!client?.isReady?.()) return null;
    const guild = client.guilds.cache.get(session.guild_id)
        || await client.guilds.fetch(session.guild_id).catch(() => null);
    if (!guild) return null;
    const member = guild.members.cache.get(session.user_id)
        || await guild.members.fetch(session.user_id).catch(() => null);
    if (!member) return null;
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return null;
    return { token, session, guild, member };
}

function requireAdministrator(auth) {
    if (auth.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const error = new Error('メインカレンダーの変更にはサーバー管理者権限が必要です。');
    error.statusCode = 403;
    throw error;
}

function canViewChannel(auth, channel) {
    if (!channel?.isTextBased?.() || channel?.isDMBased?.()) return false;
    const permissions = channel.permissionsFor?.(auth.member);
    return Boolean(permissions?.has(PermissionsBitField.Flags.ViewChannel));
}

function canManageChannel(auth, channel) {
    if (!canViewChannel(auth, channel)) return false;
    const permissions = channel.permissionsFor?.(auth.member);
    return Boolean(permissions?.has(PermissionsBitField.Flags.ManageMessages));
}

function visibleChannelIds(auth) {
    return new Set(
        [...auth.guild.channels.cache.values()]
            .filter(channel => canViewChannel(auth, channel))
            .map(channel => String(channel.id)),
    );
}

function manageableChannelIds(auth) {
    return new Set(
        [...auth.guild.channels.cache.values()]
            .filter(channel => canManageChannel(auth, channel))
            .map(channel => String(channel.id)),
    );
}

async function hydrateConfiguredChannels(auth, monitors) {
    const missingIds = [...new Set(
        monitors
            .map(monitor => String(monitor.channel_id || '').trim())
            .filter(id => id && !auth.guild.channels.cache.has(id)),
    )];
    await Promise.all(
        missingIds.map(id => auth.guild.channels.fetch(id).catch(() => null)),
    );
}

async function requireManageableChannel(auth, channelId) {
    const id = String(channelId || '').trim();
    const channel = auth.guild.channels.cache.get(id)
        || await auth.guild.channels.fetch(id).catch(() => null);
    if (!canManageChannel(auth, channel)) {
        const error = new Error('このチャンネルを管理する権限がありません。');
        error.statusCode = 403;
        throw error;
    }
    return channel;
}

async function requireMonitorAccess(auth, monitorId) {
    const id = Number(monitorId);
    if (!Number.isInteger(id) || id < 1) {
        const error = new Error('投稿先を選択してください。');
        error.statusCode = 400;
        throw error;
    }
    const monitors = await get.monitorsByGuild(auth.session.guild_id);
    const monitor = monitors.find(item => Number(item.id) === id);
    if (!monitor) {
        const error = new Error('投稿先設定が見つかりません。');
        error.statusCode = 404;
        throw error;
    }
    await requireManageableChannel(auth, monitor.channel_id);
    return monitor;
}

async function requireEventAccess(auth, payload) {
    const detail = await getWebScheduleDetail(auth.session.guild_id, {
        calendarId: payload?.calendarId,
        eventId: payload?.eventId,
        scope: 'instance',
    });
    await requireMonitorAccess(auth, detail.monitorId);
    return detail;
}

async function bootstrap(auth) {
    const channels = auth.guild.channels.cache;
    const roles = auth.guild.roles.cache;
    const [monitors, mainCalendarId, rawReactionRules] = await Promise.all([
        get.monitorsByGuild(auth.session.guild_id),
        currentMainCalendar(auth.session.guild_id),
        listWebReactionRules(auth.session.guild_id, auth.guild),
    ]);

    await hydrateConfiguredChannels(auth, monitors);

    const visibleIds = visibleChannelIds(auth);
    const manageableIds = manageableChannelIds(auth);
    const reactionRules = rawReactionRules
        .filter(rule => visibleIds.has(String(rule.channelId)));
    const visibleMonitors = monitors.filter(monitor => visibleIds.has(String(monitor.channel_id)));
    const visibleChannels = [...channels.values()]
        .filter(channel => visibleIds.has(String(channel.id)))
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
        .map(channel => ({
            id: channel.id,
            name: channel.name || channel.id,
            canManage: manageableIds.has(String(channel.id)),
        }));

    return {
        guild: { id: auth.guild.id, name: auth.guild.name },
        user: { id: auth.member.id, displayName: auth.member.displayName },
        permissions: {
            manageMainCalendar: auth.member.permissions.has(PermissionsBitField.Flags.Administrator),
        },
        mainCalendarId,
        monitors: visibleMonitors.map(monitor => ({
            id: monitor.id,
            channelId: monitor.channel_id,
            channelName: channels.get(monitor.channel_id)?.name || monitor.channel_id,
            calendarId: monitor.calendar_id,
            triggerKeyword: String(monitor.trigger_keyword || '').replace(/[【】]/g, '').trim(),
            defaultMentionRoleId: monitor.mention_role || null,
            canManage: manageableIds.has(String(monitor.channel_id)),
        })),
        roles: [...roles.values()]
            .filter(role => role.id !== auth.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => ({ id: role.id, name: role.name })),
        channels: visibleChannels,
        guildEmojis: guildEmojiPayload(auth.guild),
        reactionRules,
    };
}

function memberPayload(member) {
    return {
        id: member.id,
        displayName: member.displayName || member.user?.globalName || member.user?.username || member.id,
        username: member.user?.username || member.id,
        bot: Boolean(member.user?.bot),
        avatarUrl: member.displayAvatarURL?.({ size: 64 }) || null,
    };
}

async function searchGuildMembers(guild, rawQuery) {
    const query = String(rawQuery || '').trim().slice(0, 100);
    if (!query) return [];

    if (/^\d{15,22}$/.test(query)) {
        const exact = await guild.members.fetch(query).catch(() => null);
        if (exact) return [memberPayload(exact)];
    }

    try {
        const found = await guild.members.search({ query, limit: 25 });
        return [...found.values()].map(memberPayload);
    } catch (error) {
        console.warn('[WebAdmin] Discord member search failed, using cache:', error?.message || error);
        const needle = query.toLocaleLowerCase('ja');
        return [...guild.members.cache.values()]
            .filter(member => {
                const names = [member.displayName, member.user?.globalName, member.user?.username]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase('ja');
                return names.includes(needle);
            })
            .slice(0, 25)
            .map(memberPayload);
    }
}

async function withBackup(guildId, result) {
    const backupOk = await triggerAutoBackup(guildId).catch(() => false);
    return { ...result, backupOk };
}

export function createAdminHandler({ client }) {
    return async function handleAdmin(req, res, requestUrl) {
        const { pathname, searchParams } = requestUrl;

        if (pathname === '/admin/login' && req.method === 'GET') {
            const result = await consumeWebAdminLogin(searchParams.get('token'));
            if (!result) {
                redirect(res, '/admin?login=expired');
                return true;
            }
            redirect(res, '/admin', { 'Set-Cookie': sessionCookie(result.sessionToken, result.maxAgeSeconds) });
            return true;
        }

        if (!pathname.startsWith('/api/admin/')) return false;

        let auth;
        try {
            auth = await withTimeout(
                authorize(req, client),
                ADMIN_AUTHORIZE_TIMEOUT_MS,
                '管理画面への接続に時間がかかっています。再試行してください。',
            );
        } catch (error) {
            console.error('[WebAdmin] authorization failed:', error);
            sendJson(req, res, 503, { error: error.message || '管理画面への接続に時間がかかっています。少し待って再試行してください。' });
            return true;
        }
        if (!auth) {
            sendJson(req, res, 401, { error: '管理画面のログインが必要です。Discordで `/reactus` を実行して開き直してください。' });
            return true;
        }

        if (req.method !== 'GET' && !verifyOrigin(req)) {
            sendJson(req, res, 403, { error: '不正な送信元です。' });
            return true;
        }

        try {
            if (pathname === '/api/admin/bootstrap' && req.method === 'GET') {
                const payload = await withTimeout(
                    bootstrap(auth),
                    ADMIN_BOOTSTRAP_TIMEOUT_MS,
                    '初期情報の読み込みに時間がかかっています。再試行してください。',
                );
                sendJson(req, res, 200, payload);
                return true;
            }
            if (pathname === '/api/admin/members' && req.method === 'GET') {
                sendJson(req, res, 200, { members: await searchGuildMembers(auth.guild, searchParams.get('q')) });
                return true;
            }
            if (pathname === '/api/admin/calendar-monitors' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.channelId);
                const monitor = await createWebCalendarMonitor(auth.session.guild_id, payload, auth.guild);
                sendJson(req, res, 201, await withBackup(auth.session.guild_id, { ok: true, monitor }));
                return true;
            }
            if (pathname === '/api/admin/calendar-monitors/update' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.channelId);
                const monitor = await updateWebCalendarMonitor(auth.session.guild_id, payload, auth.guild);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, monitor }));
                return true;
            }
            if (pathname === '/api/admin/calendar-monitors/delete' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireMonitorAccess(auth, payload?.id);
                const result = await deleteWebCalendarMonitor(auth.session.guild_id, payload);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, ...result }));
                return true;
            }
            if (pathname === '/api/admin/main-calendar' && req.method === 'POST') {
                requireAdministrator(auth);
                const payload = await readJson(req);
                const result = payload?.clear
                    ? await clearWebMainCalendar(auth.session.guild_id)
                    : await setWebMainCalendar(auth.session.guild_id, payload?.calendarId);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, ...result }));
                return true;
            }
            if (pathname === '/api/admin/events' && req.method === 'GET') {
                const days = Number(searchParams.get('days') || 90);
                const pastDays = Number(searchParams.get('pastDays') || 0);
                const forceRefresh = searchParams.get('refresh') === '1';
                const visibleIds = visibleChannelIds(auth);
                const events = await listWebSchedules(auth.session.guild_id, days, pastDays, { forceRefresh });
                sendJson(req, res, 200, {
                    events: events.filter(event => visibleIds.has(String(event.channelId))),
                });
                return true;
            }
            if (pathname === '/api/admin/event' && req.method === 'GET') {
                const detail = await getWebScheduleDetail(auth.session.guild_id, {
                    calendarId: searchParams.get('calendarId'),
                    eventId: searchParams.get('eventId'),
                    scope: searchParams.get('scope') || 'instance',
                });
                await requireMonitorAccess(auth, detail.monitorId);
                sendJson(req, res, 200, { event: detail });
                return true;
            }
            if (pathname === '/api/admin/schedules' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireMonitorAccess(auth, payload?.monitorId);
                const event = await createWebSchedule(auth.session.guild_id, payload);
                sendJson(req, res, 201, { ok: true, event: { id: event.id, summary: event.summary, htmlLink: event.htmlLink || null } });
                return true;
            }
            if (pathname === '/api/admin/duplicate' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireEventAccess(auth, payload);
                const event = await duplicateWebSchedule(auth.session.guild_id, payload);
                sendJson(req, res, 201, { ok: true, event: { id: event.id, summary: event.summary, htmlLink: event.htmlLink || null } });
                return true;
            }
            if (pathname === '/api/admin/move' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireEventAccess(auth, payload);
                const event = await moveWebSchedule(auth.session.guild_id, payload);
                sendJson(req, res, 200, { ok: true, event: { id: event.id, summary: event.summary, htmlLink: event.htmlLink || null } });
                return true;
            }
            if (pathname === '/api/admin/update' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireMonitorAccess(auth, payload?.monitorId);
                const event = await updateWebSchedule(auth.session.guild_id, payload);
                sendJson(req, res, 200, { ok: true, event: { id: event.id, summary: event.summary, htmlLink: event.htmlLink || null } });
                return true;
            }
            if (pathname === '/api/admin/delete' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireEventAccess(auth, payload);
                sendJson(req, res, 200, { ok: true, ...(await deleteWebSchedule(auth.session.guild_id, payload)) });
                return true;
            }
            if (pathname === '/api/admin/announcements' && req.method === 'GET') {
                const visibleIds = visibleChannelIds(auth);
                const announcements = await listWebAnnouncements(auth.session.guild_id, auth.guild);
                sendJson(req, res, 200, {
                    announcements: announcements.filter(item => visibleIds.has(String(item.channelId))),
                });
                return true;
            }
            if (pathname === '/api/admin/announcements' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.channelId);
                const announcement = await saveWebAnnouncement(auth.session.guild_id, payload, auth.guild);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, announcement }));
                return true;
            }
            if (pathname === '/api/admin/announcements/delete' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.channelId);
                const result = await deleteWebAnnouncement(auth.session.guild_id, payload, auth.guild);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, ...result }));
                return true;
            }
            if (pathname === '/api/admin/reactions' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.channelId);
                const rule = await createWebReactionRule(auth.session.guild_id, payload, auth.guild);
                sendJson(req, res, 201, await withBackup(auth.session.guild_id, { ok: true, rule }));
                return true;
            }
            if (pathname === '/api/admin/reactions/update' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.originalChannelId);
                await requireManageableChannel(auth, payload?.channelId);
                const rule = await updateWebReactionRule(auth.session.guild_id, payload, auth.guild);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, rule }));
                return true;
            }
            if (pathname === '/api/admin/reactions/delete' && req.method === 'POST') {
                const payload = await readJson(req);
                await requireManageableChannel(auth, payload?.channelId);
                const result = await deleteWebReactionRule(auth.session.guild_id, payload);
                sendJson(req, res, 200, await withBackup(auth.session.guild_id, { ok: true, ...result }));
                return true;
            }
            if (pathname === '/api/admin/logout' && req.method === 'POST') {
                await revokeWebAdminSession(auth.token);
                res.writeHead(204, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
                res.end();
                return true;
            }
            sendJson(req, res, 404, { error: 'Not Found' });
            return true;
        } catch (error) {
            console.error('[WebAdmin] request failed:', error);
            sendJson(req, res, error.statusCode || 400, { error: error.message || '管理画面の操作に失敗しました。' });
            return true;
        }
    };
}
