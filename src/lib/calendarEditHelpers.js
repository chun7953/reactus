export function parseTriggeredSummary(summary = '') {
    const match = String(summary).match(/^【([^】]+)】(.*)$/s);
    if (!match) return { trigger: null, title: String(summary) };
    return { trigger: match[1].trim(), title: match[2].trim() };
}

export function rewriteTriggeredTitle(summary, title) {
    if (title === null || title === undefined) return String(summary || '');
    const { trigger } = parseTriggeredSummary(summary);
    if (!trigger) throw new Error('この予定にはReactusの監視キーワードがありません。');
    const cleaned = String(title).trim();
    if (!cleaned) throw new Error('タイトルを空にはできません。');
    return `【${trigger}】${cleaned}`;
}

export function parseGiveawayDescription(description = '') {
    const prizes = [];
    const messageLines = [];
    for (const line of String(description).split('\n')) {
        const trimmed = line.trim();
        const match = trimmed.match(/^【(.+)\/(\d+)】$/);
        if (match) {
            prizes.push({ prize: match[1].trim(), winners: Number(match[2]) });
        } else {
            messageLines.push(line);
        }
    }
    return {
        prizes,
        message: messageLines.join('\n').trim(),
    };
}

function resolvePrize(existing, prize, winners, label) {
    if (prize === null && winners === null) return existing || null;
    const resolvedPrize = prize === null ? existing?.prize : String(prize || '').trim();
    const resolvedWinners = winners === null ? existing?.winners : winners;
    if (!resolvedPrize || !Number.isInteger(resolvedWinners) || resolvedWinners < 1) {
        throw new Error(`${label}は景品名と当選人数をセットで指定してください。`);
    }
    return { prize: resolvedPrize, winners: resolvedWinners };
}

export function editGiveawayDescription({
    description = '',
    prize = null,
    winners = null,
    prize2 = null,
    winners2 = null,
    prize3 = null,
    winners3 = null,
    removeExtraPrizes = false,
    message = null,
    clearMessage = false,
} = {}) {
    if (message !== null && clearMessage) {
        throw new Error('本文の指定と本文削除は同時に使えません。');
    }

    const parsed = parseGiveawayDescription(description);
    const first = resolvePrize(parsed.prizes[0], prize, winners, '景品1');
    if (!first) throw new Error('抽選には最低1つの景品が必要です。');

    let nextPrizes = [first];
    if (!removeExtraPrizes) {
        const second = resolvePrize(parsed.prizes[1], prize2, winners2, '景品2');
        const third = resolvePrize(parsed.prizes[2], prize3, winners3, '景品3');
        if (second) nextPrizes.push(second);
        if (third) nextPrizes.push(third);
        if (parsed.prizes.length > 3) nextPrizes.push(...parsed.prizes.slice(3));
    } else if (prize2 !== null || winners2 !== null || prize3 !== null || winners3 !== null) {
        throw new Error('追加景品を削除しながら追加景品2/3を指定することはできません。');
    }

    const nextMessage = clearMessage
        ? ''
        : (message === null ? parsed.message : String(message).trim());
    const prizeLines = nextPrizes.map(item => `【${item.prize}/${item.winners}】`);
    return {
        description: [...prizeLines, nextMessage].filter(Boolean).join('\n'),
        prizes: nextPrizes,
        message: nextMessage,
    };
}

export function buildPrivatePropertiesPatch(existing = {}, {
    mention = null,
    mentionRoleId = null,
    assetMode = 'keep',
    assetId = null,
} = {}) {
    if (mention === false && mentionRoleId) {
        throw new Error('メンションなしとメンションロールは同時に指定できません。');
    }

    const next = { ...existing };
    if (mention !== null || mentionRoleId) {
        if (mention === false) {
            next.reactusMentionMode = 'none';
            delete next.reactusMentionRoleId;
        } else if (mentionRoleId) {
            next.reactusMentionMode = 'role';
            next.reactusMentionRoleId = String(mentionRoleId);
        } else {
            next.reactusMentionMode = 'default';
            delete next.reactusMentionRoleId;
        }
    }

    if (assetMode === 'replace') {
        if (!assetId) throw new Error('画像置換には新しい画像IDが必要です。');
        next.reactusAssetId = String(assetId);
    } else if (assetMode === 'remove') {
        delete next.reactusAssetId;
    } else if (assetMode !== 'keep') {
        throw new Error(`Unsupported asset mode: ${assetMode}`);
    }

    return next;
}

export function hasRecurrenceEdit(values = {}) {
    return [
        values.unit,
        values.interval,
        values.weekdays,
        values.monthlyDay,
        values.monthlyWeek,
        values.monthlyWeekday,
        values.until,
        values.count,
    ].some(value => value !== null && value !== undefined);
}

export function currentEventWindow(event) {
    const start = new Date(event?.start?.dateTime || event?.start?.date);
    const end = new Date(event?.end?.dateTime || event?.end?.date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new Error('予定の開始・終了時刻を読み取れません。');
    }
    return { start, end, durationMs: end.getTime() - start.getTime() };
}
