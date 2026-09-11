import { showAdminNotice } from './admin-notice.js';

const MAX_TARGETS = 20;

const mentionState = {
  mode: 'default',
  targets: [],
  memberResults: [],
  searchTimer: null,
};

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }

function keyOf(target) {
  return target?.id ? `${target.type}:${target.id}` : target?.type;
}

function dedupe(targets = []) {
  const seen = new Set();
  const result = [];
  for (const target of targets) {
    if (!target || !['role','user','everyone','here'].includes(target.type)) continue;
    const normalized = target.id ? { ...target, id: String(target.id) } : { ...target };
    const key = keyOf(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= MAX_TARGETS) break;
  }
  return result;
}

function roleName(id) {
  const option = [...(q('#mentionRole')?.options || [])].find(item => String(item.value) === String(id));
  return option?.textContent?.replace(/^@/, '') || `role:${id}`;
}

function targetLabel(target) {
  if (target.type === 'everyone') return '@everyone';
  if (target.type === 'here') return '@here';
  if (target.type === 'role') return `@${roleName(target.id)}`;
  if (target.type === 'user') return `@${target.label || target.username || target.id}`;
  return '';
}

function syncLegacyControls() {
  const legacyMode = q('#mentionMode');
  if (!legacyMode) return;
  // Keep the hidden base controls aligned so the base preview does not add a
  // second mention while the rich editor renders its structured custom targets.
  legacyMode.value = mentionState.mode === 'custom' ? 'none' : mentionState.mode;
  legacyMode.dispatchEvent(new Event('change', { bubbles: true }));
}

function setMode(mode) {
  mentionState.mode = ['default','none','custom'].includes(mode) ? mode : 'default';
  if (q('#richMentionMode')) q('#richMentionMode').value = mentionState.mode;
  q('#richMentionCustom')?.classList.toggle('hidden', mentionState.mode !== 'custom');
  syncLegacyControls();
  renderTargets();
  refreshPreview();
}

function addTarget(target) {
  if (mentionState.targets.some(item => keyOf(item) === keyOf(target))) return;
  if (mentionState.targets.length >= MAX_TARGETS) {
    showLocalNotice(`メンション対象は最大${MAX_TARGETS}件までです。`, true);
    return;
  }
  mentionState.targets.push(target);
  setMode('custom');
}

function removeTarget(key) {
  mentionState.targets = mentionState.targets.filter(item => keyOf(item) !== key);
  if (!mentionState.targets.length && mentionState.mode === 'custom') setMode('none');
  else {
    renderTargets();
    refreshPreview();
  }
}

function showLocalNotice(message, error = false) {
  showAdminNotice(message, { error });
}

function renderTargets() {
  const box = q('#richMentionTargets');
  if (!box) return;
  box.replaceChildren();
  if (!mentionState.targets.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = '対象なし';
    box.append(empty);
    return;
  }
  for (const target of mentionState.targets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rich-mention-chip';
    button.textContent = `${targetLabel(target)} ×`;
    button.title = 'クリックで削除';
    button.addEventListener('click', () => removeTarget(keyOf(target)));
    box.append(button);
  }
}

export function syncMentionRoleOptions() {
  const source = q('#mentionRole');
  const select = q('#richMentionRole');
  if (!source || !select) return;
  const current = select.value;
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'ロールを選択';
  select.append(placeholder);
  for (const option of source.options) {
    if (!option.value) continue;
    const clone = document.createElement('option');
    clone.value = option.value;
    clone.textContent = option.textContent;
    select.append(clone);
  }
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function renderMemberResults() {
  const box = q('#richMentionMemberResults');
  if (!box) return;
  box.replaceChildren();
  for (const member of mentionState.memberResults) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'member-result';
    if (member.avatarUrl) {
      const image = document.createElement('img');
      image.src = member.avatarUrl;
      image.alt = '';
      button.append(image);
    }
    const text = document.createElement('span');
    text.textContent = `${member.displayName}${member.username && member.username !== member.displayName ? ` (${member.username})` : ''}${member.bot ? ' [BOT]' : ''}`;
    button.append(text);
    button.addEventListener('click', () => {
      addTarget({ type:'user', id:String(member.id), label:member.displayName, username:member.username });
      q('#richMentionMemberSearch').value = '';
      mentionState.memberResults = [];
      renderMemberResults();
    });
    box.append(button);
  }
}

async function searchMembers(query) {
  const value = String(query || '').trim();
  if (!value) {
    mentionState.memberResults = [];
    renderMemberResults();
    return;
  }
  try {
    const response = await fetch(`/api/admin/members?q=${encodeURIComponent(value)}`, { credentials:'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    mentionState.memberResults = data.members || [];
    renderMemberResults();
  } catch (error) {
    mentionState.memberResults = [];
    renderMemberResults();
    showLocalNotice(error.message, true);
  }
}

function scheduleMemberSearch() {
  window.clearTimeout(mentionState.searchTimer);
  mentionState.searchTimer = window.setTimeout(() => searchMembers(q('#richMentionMemberSearch')?.value), 280);
}

function installStyles() {
  if (q('#richMentionStyles')) return;
  const style = document.createElement('style');
  style.id = 'richMentionStyles';
  style.textContent = `
    .rich-mention-editor{display:grid;gap:12px;margin:14px 0}
    .rich-mention-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
    .rich-mention-row label{flex:1;min-width:220px}
    .rich-mention-targets{display:flex;gap:7px;flex-wrap:wrap;min-height:42px;padding:8px;border:1px dashed #354253;border-radius:10px}
    .rich-mention-chip{border:1px solid #354253;background:#111820;color:#eef3f8;border-radius:8px;padding:6px 9px}
    .rich-mention-quick{display:flex;gap:7px;flex-wrap:wrap}
    .member-results{display:grid;gap:4px;max-height:240px;overflow:auto;margin-top:6px}
    .member-result{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid #354253;background:#101720;color:#eef3f8;border-radius:8px;padding:7px 9px}
    .member-result img{width:28px;height:28px;border-radius:50%;object-fit:cover}
  `;
  document.head.append(style);
}

function installEditor() {
  if (q('#richMentionEditor')) return true;
  const legacy = q('#mentionMode');
  const legacyGrid = legacy?.closest('.grid.two');
  if (!legacyGrid) return false;

  legacyGrid.classList.add('hidden');
  const section = document.createElement('div');
  section.id = 'richMentionEditor';
  section.className = 'field-block rich-mention-editor';
  section.innerHTML = `
    <label>
      <span>メンション</span>
      <select id="richMentionMode">
        <option value="default">現在のカレンダー設定を使う</option>
        <option value="none">メンションしない</option>
        <option value="custom">対象を指定する</option>
      </select>
    </label>
    <div id="richMentionCustom" class="hidden">
      <div class="rich-mention-quick">
        <button id="addEveryoneMention" class="small" type="button">＋ @everyone</button>
        <button id="addHereMention" class="small" type="button">＋ @here</button>
      </div>
      <div class="rich-mention-row">
        <label><span>ロール</span><select id="richMentionRole"><option value="">ロールを選択</option></select></label>
        <button id="addRoleMention" class="small" type="button">ロールを追加</button>
      </div>
      <div class="rich-mention-row">
        <label>
          <span>ユーザー</span>
          <input id="richMentionMemberSearch" type="search" autocomplete="off" placeholder="表示名・ユーザー名・ユーザーIDで検索">
          <div id="richMentionMemberResults" class="member-results"></div>
        </label>
      </div>
      <div>
        <span class="field-title">選択中</span>
        <div id="richMentionTargets" class="rich-mention-targets"></div>
        <p class="hint">ロール・ユーザー・@everyone・@here を合わせて最大20件まで指定できます。</p>
      </div>
    </div>`;
  legacyGrid.after(section);

  q('#richMentionMode').addEventListener('change', event => setMode(event.target.value));
  q('#addEveryoneMention').addEventListener('click', () => addTarget({ type:'everyone' }));
  q('#addHereMention').addEventListener('click', () => addTarget({ type:'here' }));
  q('#addRoleMention').addEventListener('click', () => {
    const id = q('#richMentionRole').value;
    if (!id) return showLocalNotice('追加するロールを選択してください。', true);
    addTarget({ type:'role', id:String(id) });
  });
  q('#richMentionMemberSearch').addEventListener('input', scheduleMemberSearch);

  syncMentionRoleOptions();
  setMode('default');
  return true;
}

export function loadMentionConfig(config) {
  const mode = config?.mode || 'default';
  mentionState.targets = dedupe((config?.targets || []).map(target => ({ ...target, id: target.id ? String(target.id) : undefined })));
  setMode(mode === 'role' ? 'custom' : mode);
  if (mode === 'role' && config?.roleId) {
    mentionState.targets = dedupe([{ type:'role', id:String(config.roleId) }, ...mentionState.targets]);
    setMode('custom');
  }
}

export function mentionPayload() {
  if (mentionState.mode !== 'custom') return { mode: mentionState.mode };
  return {
    mode: 'custom',
    targets: mentionState.targets.map(target => target.id ? { type:target.type, id:String(target.id) } : { type:target.type }),
  };
}

function refreshPreview() {
  const form = q('#scheduleForm');
  if (form) form.dispatchEvent(new Event('input', { bubbles:true }));
  window.setTimeout(decoratePreview, 0);
}

function previewText() {
  return mentionState.mode === 'custom' ? mentionState.targets.map(targetLabel).join(' ') : '';
}

function decoratePreview() {
  const root = q('#discordPreviewContent');
  const text = previewText();
  if (!root) return;
  qa('[data-rich-mentions-preview]').forEach(node => node.remove());
  if (!text) return;

  const type = q('#scheduleType')?.value || 'post';
  if (type === 'post') {
    const card = root.querySelector('.discord-message-preview');
    if (!card) return;
    const line = document.createElement('div');
    line.dataset.richMentionsPreview = 'true';
    line.className = 'discord-preview-body';
    line.style.marginTop = '10px';
    line.textContent = text;
    card.append(line);
    return;
  }

  const nonGiveaway = [...root.querySelectorAll('.discord-message-preview:not(.discord-giveaway-preview)')].at(-1);
  if (nonGiveaway) {
    const line = document.createElement('div');
    line.dataset.richMentionsPreview = 'true';
    line.className = 'discord-preview-body';
    line.style.marginTop = '8px';
    line.textContent = text;
    nonGiveaway.append(line);
    return;
  }

  const card = document.createElement('div');
  card.dataset.richMentionsPreview = 'true';
  card.className = 'discord-message-preview';
  card.innerHTML = '<div class="discord-preview-meta">すべての抽選投稿のあとに1回送信</div>';
  const body = document.createElement('div');
  body.className = 'discord-preview-body';
  body.textContent = text;
  card.append(body);
  root.append(card);
}

function initialize() {
  installStyles();
  installEditor();

  const form = q('#scheduleForm');
  form?.addEventListener('reset', () => window.setTimeout(() => {
    mentionState.targets = [];
    setMode('default');
  }, 0));
  form?.addEventListener('input', () => window.setTimeout(decoratePreview, 0));
  form?.addEventListener('change', () => window.setTimeout(decoratePreview, 0));
}

initialize();
