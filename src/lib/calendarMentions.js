const MAX_MENTION_TARGETS = 20;
const ID_PATTERN = /^\d+$/;
const TARGET_TYPES = new Set(['role', 'user', 'everyone', 'here']);

function normalizeTarget(raw) {
    const type = String(raw?.type || '').trim();
    if (!TARGET_TYPES.has(type)) throw new Error('メンション対象の種類が正しくありません。');
    if (type === 'everyone' || type === 'here') return { type };
    const id = String(raw?.id || '').trim();
    if (!ID_PATTERN.test(id)) throw new Error(type === 'role'
        ? 'メンションするロールを選択してください。'
        : 'メンションするユーザーを選択してください。');
    return { type, id };
}

function targetKey(target) {
    return target.id ? `${target.type}:${target.id}` : target.type;
}

export function normalizeMentionConfig(input = {}) {
    const requestedMode = String(input?.mode || 'default').trim();

    // Legacy single-role payloads are upgraded to the custom-target model.
    if (requestedMode === 'role') {
        return {
            mode: 'custom',
            targets: [normalizeTarget({ type: 'role', id: input?.roleId })],
        };
    }

    if (requestedMode === 'default' || requestedMode === 'none') {
        return { mode: requestedMode, targets: [] };
    }
    if (requestedMode !== 'custom') throw new Error('メンション設定が正しくありません。');

    const rawTargets = Array.isArray(input?.targets) ? input.targets : [];
    if (rawTargets.length === 0) throw new Error('メンション対象を1つ以上追加してください。');
    if (rawTargets.length > MAX_MENTION_TARGETS) {
        throw new Error(`メンション対象は最大${MAX_MENTION_TARGETS}件までです。`);
    }

    const seen = new Set();
    const targets = [];
    for (const raw of rawTargets) {
        const target = normalizeTarget(raw);
        const key = targetKey(target);
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push(target);
    }
    if (targets.length === 0) throw new Error('メンション対象を1つ以上追加してください。');
    return { mode: 'custom', targets };
}

export function encodeMentionTargets(targets = []) {
    return targets.map(target => {
        if (target.type === 'role') return `r:${target.id}`;
        if (target.type === 'user') return `u:${target.id}`;
        if (target.type === 'everyone') return 'everyone';
        if (target.type === 'here') return 'here';
        throw new Error('メンション対象の種類が正しくありません。');
    }).join(',');
}

export function decodeMentionTargets(value = '') {
    const targets = [];
    const seen = new Set();
    for (const part of String(value || '').split(',').map(item => item.trim()).filter(Boolean)) {
        let target = null;
        if (part === 'everyone') target = { type: 'everyone' };
        else if (part === 'here') target = { type: 'here' };
        else if (/^r:\d+$/.test(part)) target = { type: 'role', id: part.slice(2) };
        else if (/^u:\d+$/.test(part)) target = { type: 'user', id: part.slice(2) };
        if (!target) continue;
        const key = targetKey(target);
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push(target);
        if (targets.length >= MAX_MENTION_TARGETS) break;
    }
    return targets;
}

export function mentionPrivateProperties(input = {}) {
    const config = normalizeMentionConfig(input);
    if (config.mode === 'default') return { reactusMentionMode: 'default' };
    if (config.mode === 'none') return { reactusMentionMode: 'none' };
    return {
        reactusMentionMode: 'custom',
        reactusMentionTargets: encodeMentionTargets(config.targets),
    };
}

export function applyMentionPrivateProperties(existing = {}, input = {}) {
    const next = { ...existing };
    delete next.reactusMentionRoleId;
    delete next.reactusMentionTargets;
    Object.assign(next, mentionPrivateProperties(input));
    return next;
}

export function mentionConfigFromPrivate(properties = {}) {
    const mode = String(properties?.reactusMentionMode || 'default');
    if (mode === 'none') return { mode: 'none', targets: [] };
    if (mode === 'custom') {
        const targets = decodeMentionTargets(properties.reactusMentionTargets);
        return targets.length ? { mode: 'custom', targets } : { mode: 'none', targets: [] };
    }
    if (mode === 'role' && ID_PATTERN.test(String(properties.reactusMentionRoleId || ''))) {
        return {
            mode: 'custom',
            targets: [{ type: 'role', id: String(properties.reactusMentionRoleId) }],
        };
    }
    return { mode: 'default', targets: [] };
}

export function mentionToken(target) {
    if (target.type === 'role') return `<@&${target.id}>`;
    if (target.type === 'user') return `<@${target.id}>`;
    if (target.type === 'everyone') return '@everyone';
    if (target.type === 'here') return '@here';
    return null;
}

export function eventMentionTokens(properties = {}, defaultRoleId = null) {
    const config = mentionConfigFromPrivate(properties);
    const targets = config.mode === 'default' && ID_PATTERN.test(String(defaultRoleId || ''))
        ? [{ type: 'role', id: String(defaultRoleId) }]
        : (config.mode === 'custom' ? config.targets : []);
    return targets.map(mentionToken).filter(Boolean);
}

const MENTION_PATTERN = /<@&\d+>|<@\d+>|<@everyone>|<@here>|@everyone|@here/g;

function normalizeMentionToken(token) {
    if (token === '<@everyone>') return '@everyone';
    if (token === '<@here>') return '@here';
    return token;
}

export function extractDiscordMentions(text = '') {
    const raw = String(text || '');
    const matches = raw.match(MENTION_PATTERN) || [];
    const mentions = [...new Set(matches.map(normalizeMentionToken))];
    const cleaned = raw.replace(MENTION_PATTERN, '').replace(/[ \t]+\n/g, '\n').trim();
    return { cleaned, mentions };
}

export { MAX_MENTION_TARGETS };
