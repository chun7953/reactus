import { google } from 'googleapis';
import {
    PermissionsBitField,
    SlashCommandBuilder,
    MessageFlags,
} from 'discord.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { get } from '../../lib/settingsCache.js';
import {
    buildRecurrence,
    formatJstDateTime,
    parseJstDateTime,
} from '../../lib/calendarScheduling.js';
import {
    bindCalendarPostImageOwner,
    deleteCalendarPostImage,
    storeCalendarPostImage,
} from '../../lib/calendarPostAssets.js';
import { resolveCalendarEventPrivateProperties } from '../../lib/calendarEventMetadata.js';
import {
    buildCalendarRoutingProperties,
    calendarDisplaySummary,
    resolveCalendarRoute,
} from '../../lib/calendarRouting.js';

const REPEAT_UNIT_CHOICES = [
    { name: '繰り返さない', value: 'once' },
    { name: '日', value: 'day' },
    { name: '週', value: 'week' },
    { name: '月', value: 'month' },
    { name: '年', value: 'year' },
];

const MONTHLY_WEEK_CHOICES = [
    { name: '第1', value: 'first' },
    { name: '第2', value: 'second' },
    { name: '第3', value: 'third' },
    { name: '第4', value: 'fourth' },
    { name: '最後', value: 'last' },
];

const WEEKDAY_CHOICES = [
    { name: '日曜日', value: 'SU' },
    { name: '月曜日', value: 'MO' },
    { name: '火曜日', value: 'TU' },
    { name: '水曜日', value: 'WE' },
    { name: '木曜日', value: 'TH' },
    { name: '金曜日', value: 'FR' },
    { name: '土曜日', value: 'SA' },
];

function addRepeatOptions(subcommand) {
    return subcommand
        .addStringOption(option => option
            .setName('repeat_unit')
            .setDescription('繰り返し単位。省略時は繰り返さない')
            .addChoices(...REPEAT_UNIT_CHOICES))
        .addIntegerOption(option => option
            .setName('repeat_interval')
            .setDescription('何単位ごとに繰り返すか。例: 5週ごとなら5')
            .setMinValue(1)
            .setMaxValue(99))
        .addStringOption(option => option
            .setName('repeat_days')
            .setDescription('週単位の曜日。例: 月,水,金'))
        .addIntegerOption(option => option
            .setName('monthly_day')
            .setDescription('月単位の日付。1〜31、月末は-1')
            .setMinValue(-1)
            .setMaxValue(31))
        .addStringOption(option => option
            .setName('monthly_week')
            .setDescription('月単位の「第○曜日」')
            .addChoices(...MONTHLY_WEEK_CHOICES))
        .addStringOption(option => option
            .setName('monthly_weekday')
            .setDescription('第○曜日の曜日')
            .addChoices(...WEEKDAY_CHOICES))
        .addStringOption(option => option
            .setName('repeat_until')
            .setDescription('繰り返し終了日 (例: 2026-12-31)'))
        .addIntegerOption(option => option
            .setName('repeat_count')
            .setDescription('指定回数で終了')
            .setMinValue(1)
            .setMaxValue(999));
}

function addMentionOptions(subcommand) {
    return subcommand
        .addBooleanOption(option => option
            .setName('mention')
            .setDescription('メンションするか。省略時は既存のカレンダー設定を使用'))
        .addRoleOption(option => option
            .setName('mention_role')
            .setDescription('この予定だけでメンションするロール'));
}

function cleanKeyword(value) {
    return String(value || '').replace(/[【】]/g, '').trim();
}

function selectMonitor(monitors, channelId, keyword, requiredKeyword = null) {
    const channelMonitors = monitors.filter(monitor => monitor.channel_id === channelId);
    const normalizedRequired = cleanKeyword(requiredKeyword);
    const normalizedKeyword = cleanKeyword(keyword);

    if (normalizedRequired) {
        return channelMonitors.find(monitor => cleanKeyword(monitor.trigger_keyword) === normalizedRequired) || null;
    }
    if (normalizedKeyword) {
        return channelMonitors.find(monitor => cleanKeyword(monitor.trigger_keyword) === normalizedKeyword) || null;
    }

    const candidates = channelMonitors.filter(monitor => cleanKeyword(monitor.trigger_keyword) !== 'ラキショ');
    return candidates.length === 1 ? candidates[0] : null;
}

function privatePropertiesFromInteraction(interaction, monitor, type, assetId = null) {
    const mention = interaction.options.getBoolean('mention');
    const mentionRole = interaction.options.getRole('mention_role');
    if (mention === false && mentionRole) {
        throw new Error('メンションなしとメンションロールは同時に指定できません。');
    }

    const properties = {
        ...buildCalendarRoutingProperties(monitor, type),
    };
    if (mention === false) {
        properties.reactusMentionMode = 'none';
    } else if (mentionRole) {
        properties.reactusMentionMode = 'role';
        properties.reactusMentionRoleId = mentionRole.id;
    } else {
        properties.reactusMentionMode = 'default';
    }
    if (assetId) properties.reactusAssetId = assetId;
    return properties;
}

async function getCalendar() {
    const { auth } = await initializeSheetsAPI();
    return { calendar: google.calendar({ version: 'v3', auth }), auth };
}

function permissionHelp(auth, calendarId) {
    const email = auth?.email ? `\nサービスアカウント: \`${auth.email}\`` : '';
    return `カレンダー \`${calendarId}\` に予定を書き込めません。Googleカレンダーの共有設定で、Reactusのサービスアカウントに「予定の変更」権限を付けてください。${email}`;
}

async function insertCalendarEvent({ calendar, auth, monitor, summary, description, start, end, recurrence, privateProperties }) {
    try {
        const response = await calendar.events.insert({
            calendarId: monitor.calendar_id,
            requestBody: {
                summary,
                description,
                start: { dateTime: formatJstDateTime(start), timeZone: 'Asia/Tokyo' },
                end: { dateTime: formatJstDateTime(end), timeZone: 'Asia/Tokyo' },
                extendedProperties: { private: privateProperties },
                ...(recurrence ? { recurrence } : {}),
            },
        });
        return response.data;
    } catch (error) {
        if (error?.code === 403 || error?.code === 404) {
            throw new Error(permissionHelp(auth, monitor.calendar_id));
        }
        throw error;
    }
}

function parseRequiredTime(value, label) {
    const date = parseJstDateTime(value);
    if (!date) throw new Error(`${label}は \`YYYY-MM-DD HH:mm\` 形式で指定してください。`);
    return date;
}

function recurrenceFromInteraction(interaction, start) {
    return buildRecurrence({
        unit: interaction.options.getString('repeat_unit') || 'once',
        interval: interaction.options.getInteger('repeat_interval') || 1,
        weekdays: interaction.options.getString('repeat_days'),
        monthlyDay: interaction.options.getInteger('monthly_day'),
        monthlyWeek: interaction.options.getString('monthly_week'),
        monthlyWeekday: interaction.options.getString('monthly_weekday'),
        until: interaction.options.getString('repeat_until'),
        count: interaction.options.getInteger('repeat_count'),
        start,
    });
}

function formatEventLink(event) {
    return event.htmlLink ? `\n${event.htmlLink}` : '';
}

async function persistOptionalImage(interaction) {
    const attachment = interaction.options.getAttachment('image');
    return storeCalendarPostImage(interaction.guildId, attachment);
}

async function insertWithOptionalImage({ interaction, calendar, auth, monitor, type, eventData }) {
    let assetId = null;
    try {
        assetId = await persistOptionalImage(interaction);
        const event = await insertCalendarEvent({
            calendar,
            auth,
            monitor,
            ...eventData,
            privateProperties: privatePropertiesFromInteraction(interaction, monitor, type, assetId),
        });
        if (assetId) {
            await bindCalendarPostImageOwner(assetId, interaction.guildId, {
                calendarId: monitor.calendar_id,
                eventId: event.id,
            });
        }
        return event;
    } catch (error) {
        if (assetId) await deleteCalendarPostImage(assetId, interaction.guildId).catch(() => {});
        throw error;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('calendarpost')
        .setDescription('DiscordからGoogleカレンダー経由の自動投稿を管理します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addSubcommand(subcommand => {
            subcommand
                .setName('post')
                .setDescription('通常の予約投稿を作成します。')
                .addStringOption(option => option.setName('title').setDescription('投稿タイトル').setRequired(true))
                .addStringOption(option => option.setName('start_time').setDescription('投稿日時 (例: 2026-09-19 22:00)').setRequired(true))
                .addIntegerOption(option => option.setName('duration_minutes').setDescription('カレンダー上の長さ。省略時30分').setMinValue(1).setMaxValue(1440))
                .addStringOption(option => option.setName('body').setDescription('投稿本文'))
                .addAttachmentOption(option => option.setName('image').setDescription('投稿に添付する画像'))
                .addStringOption(option => option.setName('keyword').setDescription('監視キーワード。通常は省略でOK'));
            addRepeatOptions(subcommand);
            addMentionOptions(subcommand);
            return subcommand;
        })
        .addSubcommand(subcommand => {
            subcommand
                .setName('giveaway')
                .setDescription('期間付き抽選をカレンダーへ登録します。')
                .addStringOption(option => option.setName('prize').setDescription('景品').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('当選人数').setRequired(true).setMinValue(1).setMaxValue(100))
                .addStringOption(option => option.setName('start_time').setDescription('抽選開始日時 (例: 2026-09-19 22:00)').setRequired(true))
                .addStringOption(option => option.setName('end_time').setDescription('抽選終了日時 (例: 2026-09-20 22:00)').setRequired(true))
                .addStringOption(option => option.setName('prize2').setDescription('追加景品2'))
                .addIntegerOption(option => option.setName('winners2').setDescription('追加景品2の当選人数').setMinValue(1).setMaxValue(100))
                .addStringOption(option => option.setName('prize3').setDescription('追加景品3'))
                .addIntegerOption(option => option.setName('winners3').setDescription('追加景品3の当選人数').setMinValue(1).setMaxValue(100))
                .addStringOption(option => option.setName('message').setDescription('抽選と一緒に投稿する本文'))
                .addAttachmentOption(option => option.setName('image').setDescription('抽選と一緒に投稿する画像'));
            addRepeatOptions(subcommand);
            addMentionOptions(subcommand);
            return subcommand;
        })
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('このサーバーの直近の自動投稿予定を表示します。')
            .addIntegerOption(option => option.setName('days').setDescription('何日先まで表示するか。省略時30日').setMinValue(1).setMaxValue(180)))
        .addSubcommand(subcommand => subcommand
            .setName('delete')
            .setDescription('カレンダーの自動投稿予定を削除します。')
            .addStringOption(option => option.setName('event_id').setDescription('listで表示されたイベントID').setRequired(true))
            .addStringOption(option => option
                .setName('scope')
                .setDescription('繰り返し予定の場合の削除範囲')
                .addChoices(
                    { name: 'この回だけ', value: 'instance' },
                    { name: '繰り返し全体', value: 'series' },
                ))),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const subcommand = interaction.options.getSubcommand();
        const monitors = await get.monitorsByGuild(interaction.guildId);
        const { calendar, auth } = await getCalendar();

        try {
            if (subcommand === 'post') {
                const keyword = interaction.options.getString('keyword');
                const monitor = selectMonitor(monitors, interaction.channelId, keyword);
                if (!monitor) {
                    const channelMonitors = monitors.filter(m => m.channel_id === interaction.channelId && cleanKeyword(m.trigger_keyword) !== 'ラキショ');
                    if (channelMonitors.length > 1 && !keyword) {
                        return interaction.editReply('このチャンネルには通常投稿用のカレンダー監視が複数あります。`keyword`を指定してください。');
                    }
                    return interaction.editReply('このチャンネルに通常投稿用のカレンダー監視がありません。先に `/setcalendar` を設定してください。');
                }

                const start = parseRequiredTime(interaction.options.getString('start_time'), '投稿日時');
                const durationMinutes = interaction.options.getInteger('duration_minutes') || 30;
                const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
                const recurrence = recurrenceFromInteraction(interaction, start);
                const title = interaction.options.getString('title').trim();
                const body = interaction.options.getString('body') || '';
                const event = await insertWithOptionalImage({
                    interaction,
                    calendar,
                    auth,
                    monitor,
                    type: 'post',
                    eventData: {
                        summary: title,
                        description: body,
                        start,
                        end,
                        recurrence,
                    },
                });
                return interaction.editReply(`✅ 自動投稿をカレンダーへ登録しました。\n**${event.summary}**\n<t:${Math.floor(start.getTime() / 1000)}:F>${recurrence ? '\n🔁 繰り返し予定' : ''}${formatEventLink(event)}`);
            }

            if (subcommand === 'giveaway') {
                const monitor = selectMonitor(monitors, interaction.channelId, null, 'ラキショ');
                if (!monitor) {
                    return interaction.editReply('このチャンネルに抽選用のカレンダー設定がありません。先に `/setcalendar` で設定してください。');
                }

                const start = parseRequiredTime(interaction.options.getString('start_time'), '抽選開始日時');
                const end = parseRequiredTime(interaction.options.getString('end_time'), '抽選終了日時');
                if (end <= start) throw new Error('抽選終了日時は開始日時より後にしてください。');
                const recurrence = recurrenceFromInteraction(interaction, start);

                const prizes = [
                    [interaction.options.getString('prize'), interaction.options.getInteger('winners')],
                    [interaction.options.getString('prize2'), interaction.options.getInteger('winners2')],
                    [interaction.options.getString('prize3'), interaction.options.getInteger('winners3')],
                ];
                for (const [prize, winners] of prizes.slice(1)) {
                    if ((prize && !winners) || (!prize && winners)) {
                        throw new Error('追加景品は「景品」と「当選人数」をセットで指定してください。');
                    }
                }
                const activePrizes = prizes.filter(([prize, winners]) => prize && winners);
                const prizeLines = activePrizes.map(([prize, winners]) => `【${prize.trim()}/${winners}】`);
                const message = interaction.options.getString('message') || '';
                const description = [prizeLines.join('\n'), message].filter(Boolean).join('\n');
                const event = await insertWithOptionalImage({
                    interaction,
                    calendar,
                    auth,
                    monitor,
                    type: 'giveaway',
                    eventData: {
                        summary: activePrizes[0][0].trim(),
                        description,
                        start,
                        end,
                        recurrence,
                    },
                });
                return interaction.editReply(`✅ 抽選をカレンダーへ登録しました。\n**${activePrizes.map(([prize, winners]) => `${prize} × ${winners}名`).join(' / ')}**\n開始: <t:${Math.floor(start.getTime() / 1000)}:F>\n終了: <t:${Math.floor(end.getTime() / 1000)}:F>${recurrence ? '\n🔁 繰り返し予定' : ''}${formatEventLink(event)}`);
            }

            if (subcommand === 'list') {
                const days = interaction.options.getInteger('days') || 30;
                const byCalendar = new Map();
                for (const monitor of monitors) {
                    if (!byCalendar.has(monitor.calendar_id)) byCalendar.set(monitor.calendar_id, []);
                    byCalendar.get(monitor.calendar_id).push(monitor);
                }
                if (byCalendar.size === 0) return interaction.editReply('このサーバーにはカレンダー監視が登録されていません。');

                const now = new Date();
                const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
                const rows = [];
                const masterMetadataCache = new Map();
                for (const [calendarId, calendarMonitors] of byCalendar) {
                    const response = await calendar.events.list({
                        calendarId,
                        timeMin: now.toISOString(),
                        timeMax: timeMax.toISOString(),
                        singleEvents: true,
                        orderBy: 'startTime',
                        maxResults: 100,
                        timeZone: 'Asia/Tokyo',
                    });
                    for (const event of response.data.items || []) {
                        const privateProperties = await resolveCalendarEventPrivateProperties(
                            calendar,
                            calendarId,
                            event,
                            masterMetadataCache,
                        );
                        const route = resolveCalendarRoute(event, calendarMonitors, privateProperties);
                        if (!route) continue;
                        const start = new Date(event.start?.dateTime || event.start?.date);
                        rows.push({ event, start, route, privateProperties });
                    }
                }
                rows.sort((a, b) => a.start - b.start);
                if (rows.length === 0) return interaction.editReply(`今後${days}日以内の自動投稿予定はありません。`);

                const lines = rows.slice(0, 20).map(({ event, start, route, privateProperties }) => {
                    const series = event.recurringEventId ? ' 🔁' : '';
                    const image = privateProperties.reactusAssetId ? ' 🖼️' : '';
                    return `<t:${Math.floor(start.getTime() / 1000)}:f>${series}${image} **${calendarDisplaySummary(event, route)}**\nID: \`${event.id}\``;
                });
                if (rows.length > 20) lines.push(`…ほか ${rows.length - 20} 件`);
                return interaction.editReply(lines.join('\n\n'));
            }

            if (subcommand === 'delete') {
                const eventId = interaction.options.getString('event_id');
                const scope = interaction.options.getString('scope') || 'instance';
                const calendarIds = [...new Set(monitors.map(monitor => monitor.calendar_id))];
                for (const calendarId of calendarIds) {
                    try {
                        const response = await calendar.events.get({ calendarId, eventId });
                        const event = response.data;
                        const calendarMonitors = monitors.filter(monitor => monitor.calendar_id === calendarId);
                        const privateProperties = await resolveCalendarEventPrivateProperties(calendar, calendarId, event);
                        if (!resolveCalendarRoute(event, calendarMonitors, privateProperties)) continue;
                        const deleteSeries = scope === 'series' && event.recurringEventId;
                        const deleteId = deleteSeries ? event.recurringEventId : event.id;
                        let assetId = privateProperties.reactusAssetId || null;
                        if (deleteSeries) {
                            const master = await calendar.events.get({ calendarId, eventId: event.recurringEventId });
                            assetId = master.data.extendedProperties?.private?.reactusAssetId || assetId;
                        }
                        await calendar.events.delete({ calendarId, eventId: deleteId });
                        if (!event.recurringEventId || deleteSeries) {
                            await deleteCalendarPostImage(assetId, interaction.guildId).catch(() => {});
                        }
                        return interaction.editReply(deleteSeries
                            ? '✅ 繰り返し予定をまとめて削除しました。'
                            : '✅ 予定を削除しました。');
                    } catch (error) {
                        if (error?.code === 404) continue;
                        if (error?.code === 403) throw new Error(permissionHelp(auth, calendarId));
                        throw error;
                    }
                }
                return interaction.editReply('指定されたイベントIDが、このサーバーの監視カレンダー内に見つかりませんでした。');
            }
        } catch (error) {
            console.error('[calendarpost] command failed:', error);
            return interaction.editReply(`エラー: ${error.message || 'カレンダー操作に失敗しました。'}`);
        }
    },
};