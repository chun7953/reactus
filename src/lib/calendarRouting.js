export function cleanCalendarTrigger(value) {
    return String(value || '').replace(/[【】]/g, '').trim();
}

export function buildCalendarRoutingProperties(monitor, type) {
    if (!monitor?.id || !monitor?.channel_id) {
        throw new Error('カレンダー投稿先の情報が不足しています。');
    }
    if (!['post', 'giveaway'].includes(type)) {
        throw new Error('カレンダー予定の種類が正しくありません。');
    }
    return {
        reactusManaged: '1',
        reactusMonitorId: String(monitor.id),
        reactusChannelId: String(monitor.channel_id),
        reactusType: type,
        reactusTriggerKeyword: cleanCalendarTrigger(monitor.trigger_keyword),
    };
}

export function hasCalendarRoutingMetadata(properties = {}) {
    return String(properties?.reactusManaged || '') === '1'
        || Boolean(properties?.reactusMonitorId)
        || Boolean(properties?.reactusType);
}

function legacyMonitorForEvent(event, monitors) {
    const text = `${event?.summary || ''}\n${event?.description || ''}`;
    return (monitors || []).find(monitor => {
        const keyword = cleanCalendarTrigger(monitor?.trigger_keyword);
        return keyword && text.includes(`【${keyword}】`);
    }) || null;
}

export function resolveCalendarRoute(event, monitors, properties = event?.extendedProperties?.private || {}) {
    const list = monitors || [];
    if (hasCalendarRoutingMetadata(properties)) {
        const monitorId = String(properties?.reactusMonitorId || '');
        const channelId = String(properties?.reactusChannelId || '');
        let monitor = monitorId
            ? list.find(candidate => String(candidate?.id) === monitorId) || null
            : null;
        if (!monitor && channelId) {
            const sameChannel = list.filter(candidate => String(candidate?.channel_id) === channelId);
            if (sameChannel.length === 1) monitor = sameChannel[0];
        }
        if (!monitor) return null;
        const metadataType = String(properties?.reactusType || '');
        const type = metadataType === 'giveaway' || metadataType === 'post'
            ? metadataType
            : (cleanCalendarTrigger(monitor.trigger_keyword) === 'ラキショ' ? 'giveaway' : 'post');
        return {
            monitor,
            type,
            triggerKeyword: cleanCalendarTrigger(monitor.trigger_keyword),
            source: 'metadata',
        };
    }

    const monitor = legacyMonitorForEvent(event, list);
    if (!monitor) return null;
    const triggerKeyword = cleanCalendarTrigger(monitor.trigger_keyword);
    return {
        monitor,
        type: triggerKeyword === 'ラキショ' ? 'giveaway' : 'post',
        triggerKeyword,
        source: 'legacy',
    };
}

export function calendarDisplaySummary(event, route = null) {
    const summary = String(event?.summary || '').trim();
    if (!summary) return 'タイトルなし';
    if (route?.source === 'metadata') return summary;
    return summary.replace(/^【[^】]+】\s*/, '') || summary;
}
