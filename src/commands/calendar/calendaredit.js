import { google } from 'googleapis';
import {
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder,
} from 'discord.js';
import { get } from '../../lib/settingsCache.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import {
    buildRecurrence,
    formatJstDateTime,
    parseJstDateTime,
} from '../../lib/calendarScheduling.js';
import {
    buildPrivatePropertiesPatch,
    currentEventWindow,
    editGiveawayDescription,
    hasRecurrenceEdit,
    parseGiveawayDescription,
    parseTriggeredSummary,
    rewriteTriggeredTitle,
} from '../../lib/calendarEditHelpers.js';
import {
    deleteCalendarPostImage,
    storeCalendarPostImage,
} from '../../lib/calendarPostAssets.js';

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

const SCOPE_CHOICES = [
    { name: 'この回だけ', value: 'instance' },
    { name: '繰り返し全体', value: 'series' },
];

function addRepeatOptions(subcommand) {
    return subcommand
        .addStringOption(option => option
            .setName('repeat_unit')
            .setDescription('繰り返し自体を変更するときだけ指定')
            .addChoices(...REPEAT_UNIT_CHOICES))
        .addIntegerOption(option => option
            .setName('repeat_interval')
            .setDescription('何単位ごとか。5週ごとなら5')
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

function addCommonEditOptions(subcommand) {
    return subcommand
        .addStringOption(option => option
            .setName('event_id')
            .setDescription('/calendarpost list で表示されたイベントID')
            .setRequired(true))
        .addStringOption(option => option
            .setName('scope')
            .setDescription('繰り返し予定の編集範囲。省略時はこの回だけ')
            .addChoices(...SCOPE_CHOICES));
}

function addMentionAndImageOptions(subcommand) {
    return subcommand
        .addBooleanOption(option => option
            .setName('mention')
            .setDescription('メンション設定を変更。trueで既定、falseでなし'))
        .addRoleOption(option => option
            .setName('mention_role')
            .setDescription('この予定だけでメンションするロール'))
        .addAttachmentOption(option => option
            .setName('image')
            .setDescription('画像を追加・置換'))
        .addBooleanOption(option => option
            .setName('remove_image')
            .setDescription('現在の画像を削除'));
}

function parseOptionalTime(value, label) {
    if (value === null) return null;
    const date = parseJstDateTime(value);
    if (!date) throw new Error(`${label}は \`YYYY-MM-DD HH:mm\` 形式で指定してください。`);
    return date;
}

async function getCalendar() {
    const { auth } = await initializeSheetsAPI();
    return { calendar: google.calendar({ version: 'v3', auth }), auth };
}

function permissionHelp(auth, calendarId) {
    const email = auth?.email ? `\nサービスアカウント: \`${auth.email}\`` : '';
    return `カレンダー \`${calendarId}\` の予定を変更できません。Googleカレンダーの共有設定で、Reactusのサービスアカウントに「予定の変更」権限を付けてください。${email}`;
}

async function locateEvent(calendar, monitors, eventId) {
    const calendarIds = [...new Set(monitors.map(monitor => monitor.calendar_id))];
    for (const calendarId of calendarIds) {
        try {
            const response = await calendar.events.get({ calendarId, eventId });
            return { calendarId, event: response.data };
        } catch (error) {
            if (error?.code === 404) continue;
            throw error;
        }
    }
    return null;
}

async function resolveTargetEvent(calendar, located, scope) {
    if (scope !== 'series' || !located.event.recurringEventId) return located;
    const response = await calendar.events.get({
        calendarId: located.calendarId,
        eventId: located.event.recurringEventId,
    });
    return { calendarId: located.calendarId, event: response.data };
}

function recurrenceValues(interaction) {
    return {
        unit: interaction.options.getString('repeat_unit'),
        interval: interaction.options.getInteger('repeat_interval'),
        weekdays: interaction.options.getString('repeat_days'),
        monthlyDay: interaction.options.getInteger('monthly_day'),
        monthlyWeek: interaction.options.getString('monthly_week'),
        monthlyWeekday: interaction.options.getString('monthly_weekday'),
        until: interaction.options.getString('repeat_until'),
        count: interaction.options.getInteger('repeat_count'),
    };
}

function recurrencePatch(interaction, start, originalWasRecurring, scope) {
    const values = recurrenceValues(interaction);
    if (!hasRecurrenceEdit(values)) return undefined;
    if (!values.unit) {
        throw new Error('繰り返しを変更する場合は `repeat_unit` も指定してください。');
    }
    if (originalWasRecurring && scope !== 'series') {
        throw new Error('繰り返しルールの変更は `scope:繰り返し全体` で行ってください。');
    }
    const recurrence = buildRecurrence({
        unit: values.unit,
        interval: values.interval || 1,
        weekdays: values.weekdays,
        monthlyDay: values.monthlyDay,
        monthlyWeek: values.monthlyWeek,
        monthlyWeekday: values.monthlyWeekday,
        until: values.until,
        count: values.count,
        start,
    });
    return recurrence || [];
}

function eventIsGiveaway(event) {
    return parseTriggeredSummary(event.summary).trigger === 'ラキショ';
}

async function imageEdit(interaction, targetEvent, originalWasRecurring, scope) {
    const attachment = interaction.options.getAttachment('image');
    const removeImage = interaction.options.getBoolean('remove_image') === true;
    if (attachment && removeImage) throw new Error('画像の追加・置換と画像削除は同時に指定できません。');
    if ((attachment || removeImage) && originalWasRecurring && scope !== 'series') {
        throw new Error('定期予定の画像変更は `scope:繰り返し全体` で行ってください。');
    }

    const oldAssetId = targetEvent.extendedProperties?.private?.reactusAssetId || null;
    if (attachment) {
        const assetId = await storeCalendarPostImage(interaction.guildId, attachment);
        return { mode: 'replace', assetId, oldAssetId, createdAssetId: assetId };
    }
    if (removeImage) return { mode: 'remove', assetId: null, oldAssetId, createdAssetId: null };
    return { mode: 'keep', assetId: null, oldAssetId, createdAssetId: null };
}

function privatePropertiesForEdit(interaction, targetEvent, image) {
    const mention = interaction.options.getBoolean('mention');
    const mentionRole = interaction.options.getRole('mention_role');
    const hasPrivateChange = mention !== null || mentionRole || image.mode !== 'keep';
    if (!hasPrivateChange) return undefined;

    return buildPrivatePropertiesPatch(targetEvent.extendedProperties?.private || {}, {
        mention,
        mentionRoleId: mentionRole?.id || null,
        assetMode: image.mode,
        assetId: image.assetId,
    });
}

async function patchEvent({ calendar, auth, calendarId, eventId, requestBody }) {
    try {
        const response = await calendar.events.patch({ calendarId, eventId, requestBody });
        return response.data;
    } catch (error) {
        if (error?.code === 403 || error?.code === 404) {
            throw new Error(permissionHelp(auth, calendarId));
        }
        throw error;
    }
}

function eventLink(event) {
    return event.htmlLink ? `\n${event.htmlLink}` : '';
}

export default {
    data: new SlashCommandBuilder()
        .setName('calendaredit')
        .setDescription('登録済みのReactusカレンダー投稿をDiscordから編集します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addSubcommand(subcommand => {
            addCommonEditOptions(subcommand
                .setName('post')
                .setDescription('通常の予約投稿を編集します。'))
                .addStringOption(option => option.setName('title').setDescription('新しい投稿タイトル'))
                .addStringOption(option => option.setName('body').setDescription('新しい本文'))
                .addBooleanOption(option => option.setName('clear_body').setDescription('本文を空にする'))
                .addStringOption(option => option.setName('start_time').setDescription('新しい投稿日時 (例: 2026-09-19 22:00)'))
                .addIntegerOption(option => option.setName('duration_minutes').setDescription('新しい予定の長さ（分）').setMinValue(1).setMaxValue(1440));
            addMentionAndImageOptions(subcommand);
            addRepeatOptions(subcommand);
            return subcommand;
        })
        .addSubcommand(subcommand => {
            addCommonEditOptions(subcommand
                .setName('giveaway')
                .setDescription('期間付き抽選を編集します。'))
                .addStringOption(option => option.setName('prize').setDescription('景品1'))
                .addIntegerOption(option => option.setName('winners').setDescription('景品1の当選人数').setMinValue(1).setMaxValue(100))
                .addStringOption(option => option.setName('prize2').setDescription('景品2'))
                .addIntegerOption(option => option.setName('winners2').setDescription('景品2の当選人数').setMinValue(1).setMaxValue(100))
                .addStringOption(option => option.setName('prize3').setDescription('景品3'))
                .addIntegerOption(option => option.setName('winners3').setDescription('景品3の当選人数').setMinValue(1).setMaxValue(100))
                .addBooleanOption(option => option.setName('remove_extra_prizes').setDescription('景品2以降をすべて削除'))
                .addStringOption(option => option.setName('message').setDescription('新しい抽選本文'))
                .addBooleanOption(option => option.setName('clear_message').setDescription('抽選本文を空にする'))
                .addStringOption(option => option.setName('start_time').setDescription('新しい開始日時 (例: 2026-09-19 22:00)'))
                .addStringOption(option => option.setName('end_time').setDescription('新しい終了日時 (例: 2026-09-20 22:00)'));
            addMentionAndImageOptions(subcommand);
            addRepeatOptions(subcommand);
            return subcommand;
        }),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const subcommand = interaction.options.getSubcommand();
        const eventId = interaction.options.getString('event_id');
        const scope = interaction.options.getString('scope') || 'instance';
        const monitors = await get.monitorsByGuild(interaction.guildId);
        const { calendar, auth } = await getCalendar();
        let createdAssetId = null;

        try {
            const located = await locateEvent(calendar, monitors, eventId);
            if (!located) {
                return interaction.editReply('指定されたイベントIDが、このサーバーの監視カレンダー内に見つかりませんでした。');
            }
            const originalWasRecurring = Boolean(located.event.recurringEventId || located.event.recurrence?.length);
            const target = await resolveTargetEvent(calendar, located, scope);
            const window = currentEventWindow(target.event);
            const image = await imageEdit(interaction, target.event, originalWasRecurring, scope);
            createdAssetId = image.createdAssetId;
            const privateProperties = privatePropertiesForEdit(interaction, target.event, image);

            if (subcommand === 'post') {
                if (eventIsGiveaway(target.event)) {
                    throw new Error('これは抽選予定です。`/calendaredit giveaway` を使ってください。');
                }
                const body = interaction.options.getString('body');
                const clearBody = interaction.options.getBoolean('clear_body') === true;
                if (body !== null && clearBody) throw new Error('本文の指定と本文削除は同時に使えません。');

                const newStart = parseOptionalTime(interaction.options.getString('start_time'), '投稿日時') || window.start;
                const durationMinutes = interaction.options.getInteger('duration_minutes');
                const durationMs = durationMinutes === null ? window.durationMs : durationMinutes * 60 * 1000;
                const newEnd = new Date(newStart.getTime() + durationMs);
                const recurrence = recurrencePatch(interaction, newStart, originalWasRecurring, scope);
                const summary = rewriteTriggeredTitle(target.event.summary, interaction.options.getString('title'));
                const description = clearBody
                    ? ''
                    : (body === null ? (target.event.description || '') : body);

                const requestBody = {
                    summary,
                    description,
                    start: { dateTime: formatJstDateTime(newStart), timeZone: 'Asia/Tokyo' },
                    end: { dateTime: formatJstDateTime(newEnd), timeZone: 'Asia/Tokyo' },
                    ...(privateProperties ? { extendedProperties: { private: privateProperties } } : {}),
                    ...(recurrence !== undefined ? { recurrence } : {}),
                };
                const updated = await patchEvent({
                    calendar, auth, calendarId: target.calendarId, eventId: target.event.id, requestBody,
                });
                if (image.mode !== 'keep' && image.oldAssetId && image.oldAssetId !== image.assetId) {
                    await deleteCalendarPostImage(image.oldAssetId).catch(() => {});
                }
                createdAssetId = null;
                return interaction.editReply(`✅ 予約投稿を編集しました。\n**${updated.summary || summary}**${scope === 'series' ? '\n🔁 繰り返し全体を更新' : ''}${eventLink(updated)}`);
            }

            if (subcommand === 'giveaway') {
                if (!eventIsGiveaway(target.event)) {
                    throw new Error('これは通常投稿です。`/calendaredit post` を使ってください。');
                }
                const newStartOption = parseOptionalTime(interaction.options.getString('start_time'), '抽選開始日時');
                const newEndOption = parseOptionalTime(interaction.options.getString('end_time'), '抽選終了日時');
                const newStart = newStartOption || window.start;
                const newEnd = newEndOption || (newStartOption
                    ? new Date(newStart.getTime() + window.durationMs)
                    : window.end);
                if (newEnd <= newStart) throw new Error('抽選終了日時は開始日時より後にしてください。');
                const recurrence = recurrencePatch(interaction, newStart, originalWasRecurring, scope);

                const parsedExisting = parseGiveawayDescription(target.event.description || '');
                const legacyDescription = parsedExisting.prizes.length > 0
                    ? (target.event.description || '')
                    : `【${parseTriggeredSummary(target.event.summary).title || 'プレゼント'}/1】${target.event.description ? `\n${target.event.description}` : ''}`;
                const edited = editGiveawayDescription({
                    description: legacyDescription,
                    prize: interaction.options.getString('prize'),
                    winners: interaction.options.getInteger('winners'),
                    prize2: interaction.options.getString('prize2'),
                    winners2: interaction.options.getInteger('winners2'),
                    prize3: interaction.options.getString('prize3'),
                    winners3: interaction.options.getInteger('winners3'),
                    removeExtraPrizes: interaction.options.getBoolean('remove_extra_prizes') === true,
                    message: interaction.options.getString('message'),
                    clearMessage: interaction.options.getBoolean('clear_message') === true,
                });
                const summary = `【ラキショ】${edited.prizes[0].prize}`;
                const requestBody = {
                    summary,
                    description: edited.description,
                    start: { dateTime: formatJstDateTime(newStart), timeZone: 'Asia/Tokyo' },
                    end: { dateTime: formatJstDateTime(newEnd), timeZone: 'Asia/Tokyo' },
                    ...(privateProperties ? { extendedProperties: { private: privateProperties } } : {}),
                    ...(recurrence !== undefined ? { recurrence } : {}),
                };
                const updated = await patchEvent({
                    calendar, auth, calendarId: target.calendarId, eventId: target.event.id, requestBody,
                });
                if (image.mode !== 'keep' && image.oldAssetId && image.oldAssetId !== image.assetId) {
                    await deleteCalendarPostImage(image.oldAssetId).catch(() => {});
                }
                createdAssetId = null;
                return interaction.editReply(`✅ 抽選予定を編集しました。\n**${edited.prizes.map(item => `${item.prize} × ${item.winners}名`).join(' / ')}**${scope === 'series' ? '\n🔁 繰り返し全体を更新' : ''}${eventLink(updated)}`);
            }
        } catch (error) {
            if (createdAssetId) await deleteCalendarPostImage(createdAssetId).catch(() => {});
            if (error?.code === 403) {
                return interaction.editReply(`エラー: ${permissionHelp(auth, '対象カレンダー')}`);
            }
            console.error('[calendaredit] command failed:', error);
            return interaction.editReply(`エラー: ${error.message || 'カレンダー予定の編集に失敗しました。'}`);
        }
    },
};
