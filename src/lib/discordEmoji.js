const CUSTOM_EMOJI_RE = /^<a?:([A-Za-z0-9_]{2,32}):(\d{5,})>$/;
const SNOWFLAKE_RE = /^\d{5,}$/;
const KEYCAP_RE = /^[0-9#*]\uFE0F?\u20E3$/u;
const EMOJI_SIGNAL_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

function graphemes(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    if (typeof Intl?.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
        return [...segmenter.segment(text)].map(item => item.segment);
    }
    return [...text];
}

export function isDiscordUnicodeEmoji(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    const segments = graphemes(text);
    if (segments.length !== 1 || segments[0] !== text) return false;
    return KEYCAP_RE.test(text) || EMOJI_SIGNAL_RE.test(text);
}

export function normalizeDiscordEmojiToken(value, { guildEmojiIds = null } = {}) {
    const text = String(value || '').trim();
    if (!text) throw new Error('絵文字が空です。');

    const custom = text.match(CUSTOM_EMOJI_RE);
    if (custom) {
        const id = custom[2];
        if (guildEmojiIds && !guildEmojiIds.has(id)) {
            throw new Error(`サーバーで利用できないカスタム絵文字です: ${text}`);
        }
        return { type: 'custom', id };
    }

    if (SNOWFLAKE_RE.test(text)) {
        if (guildEmojiIds && !guildEmojiIds.has(text)) {
            throw new Error(`サーバーで利用できないカスタム絵文字IDです: ${text}`);
        }
        return { type: 'custom', id: text };
    }

    if (!isDiscordUnicodeEmoji(text)) {
        throw new Error(`Discordリアクションとして扱えない値です: ${text}`);
    }
    return { type: 'unicode', value: text };
}

export function normalizeDiscordEmojiList(values, { guildEmojiIds = null, max = 20 } = {}) {
    const source = Array.isArray(values) ? values : String(values || '').split(',');
    const normalized = [];
    const seen = new Set();

    for (const raw of source) {
        let descriptor;
        if (raw && typeof raw === 'object' && raw.type === 'custom') {
            descriptor = normalizeDiscordEmojiToken(String(raw.id || ''), { guildEmojiIds });
        } else if (raw && typeof raw === 'object' && raw.type === 'unicode') {
            descriptor = normalizeDiscordEmojiToken(String(raw.value || ''), { guildEmojiIds });
        } else {
            descriptor = normalizeDiscordEmojiToken(raw, { guildEmojiIds });
        }

        const key = descriptor.type === 'custom' ? `c:${descriptor.id}` : `u:${descriptor.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(descriptor);
        if (normalized.length > max) throw new Error(`リアクションは最大${max}個までです。`);
    }

    return normalized;
}

export function descriptorsToReactionCsv(descriptors, guildEmojiById = new Map()) {
    return normalizeDiscordEmojiList(descriptors).map(item => {
        if (item.type === 'unicode') return item.value;
        const emoji = guildEmojiById.get(item.id);
        if (!emoji) return item.id;
        return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
    }).join(',');
}

export function descriptorsForClient(csv, guildEmojiIds = null) {
    if (!String(csv || '').trim()) return [];
    return normalizeDiscordEmojiList(String(csv).split(','), { guildEmojiIds });
}
