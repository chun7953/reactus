const qa = (selector) => [...document.querySelectorAll(selector)];
const q = (selector) => document.querySelector(selector);
const commonEmoji = ['✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚪','⚫','👍','👎','❤️','🎉','⭐','👀','💡','📌','🔥'];

const toolsState = {
  bootstrap: null,
  events: [],
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  draft: [],
  editing: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function notice(message, error = false) {
  const node = q('#notice');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.remove('hidden');
  window.setTimeout(() => node.classList.add('hidden'), 7000);
}

function installStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .tools-panel{margin-top:20px}
    .tools-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .tools-row input,.tools-row select{width:auto;min-width:180px}
    .month-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
    .month-nav{display:flex;align-items:center;gap:8px}
    .month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #263240;border-radius:12px;overflow:hidden}
    .month-weekday{padding:7px;text-align:center;font-size:12px;color:#8d9aaa;background:#111820;border-right:1px solid #263240}
    .month-day{min-height:105px;padding:7px;border-top:1px solid #263240;border-right:1px solid #263240;background:#0b1016;overflow:hidden}
    .month-day.outside{opacity:.35}
    .month-day.today{box-shadow:inset 0 0 0 1px #7289ff}
    .month-num{font-size:12px;color:#aab5c2;margin-bottom:5px}
    .month-event{display:block;width:100%;border:0;border-radius:6px;padding:4px 5px;margin:3px 0;background:#172231;color:#eef3f8;text-align:left;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
    .month-event.giveaway{background:#251d35}
    .reaction-editor{display:grid;gap:14px}
    .emoji-grid{display:flex;gap:7px;flex-wrap:wrap}
    .emoji-button{width:42px;height:42px;padding:0;display:grid;place-items:center;border-radius:8px;border:1px solid #354253;background:#101720;color:#eef3f8;font-size:22px}
    .emoji-button.selected{border-color:#7289ff;background:#1d2946}
    .emoji-button img{width:27px;height:27px;object-fit:contain}
    .selected-emojis{display:flex;flex-wrap:wrap;gap:7px;min-height:42px;padding:8px;border:1px dashed #354253;border-radius:10px}
    .selected-emojis button{display:inline-flex;align-items:center;gap:5px;border:1px solid #354253;background:#111820;color:#eef3f8;border-radius:8px;padding:5px 8px}
    .selected-emojis img,.rule-emojis img{width:20px;height:20px;object-fit:contain}
    .reaction-rule{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:12px 0;border-top:1px solid #263240}
    .reaction-rule:first-child{border-top:0}
    .reaction-actions{display:flex;gap:7px;align-items:center}
    .rule-emojis{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:5px}
    .invalid-rule{color:#ff9c9c;font-size:12px;margin-top:4px}
    .calendar-search{margin-right:auto}
    @media(max-width:760px){.month-grid{grid-template-columns:1fr}.month-weekday{display:none}.month-day{min-height:auto;border-right:0}.month-day.outside{display:none}.reaction-rule{grid-template-columns:1fr}.tools-row input,.tools-row select{width:100%}}
  `;
  document.head.append(style);
}

function addSearchBox() {
  const refresh = q('#refreshEvents');
  const head = refresh?.closest('.section-head');
  if (!head || q('#eventSearch')) return;
  const input = document.createElement('input');
  input.id = 'eventSearch';
  input.type = 'search';
  input.className = 'calendar-search';
  input.placeholder = '予定を検索';
  input.addEventListener('input', () => {
    const needle = input.value.trim().toLowerCase();
    qa('#eventList .event-card').forEach(card => {
      card.style.display = !needle || card.textContent.toLowerCase().includes(needle) ? '' : 'none';
    });
  });
  refresh.before(input);
}

function dateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function jstTime(value) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone:'Asia/Tokyo', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(value));
}

function renderMonth() {
  const grid = q('#monthGrid');
  const label = q('#monthLabel');
  if (!grid || !label) return;
  const y = toolsState.calendarMonth.getFullYear();
  const m = toolsState.calendarMonth.getMonth();
  label.textContent = `${y}年${m + 1}月`;
  grid.replaceChildren();

  ['日','月','火','水','木','金','土'].forEach(day => {
    const node = document.createElement('div');
    node.className = 'month-weekday';
    node.textContent = day;
    grid.append(node);
  });

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const todayKey = dateKey(new Date());
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'month-day';
    if (day.getMonth() !== m) cell.classList.add('outside');
    if (key === todayKey) cell.classList.add('today');
    const num = document.createElement('div');
    num.className = 'month-num';
    num.textContent = String(day.getDate());
    cell.append(num);

    const events = toolsState.events.filter(event => dateKey(event.start) === key);
    for (const event of events.slice(0, 6)) {
      const link = document.createElement(event.htmlLink ? 'a' : 'div');
      link.className = `month-event ${event.type === 'giveaway' ? 'giveaway' : ''}`;
      link.textContent = `${jstTime(event.start)} ${String(event.summary || '').replace(/^【[^】]+】/,'')}`;
      link.title = event.summary || '';
      if (event.htmlLink) {
        link.href = event.htmlLink;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      cell.append(link);
    }
    if (events.length > 6) {
      const more = document.createElement('div');
      more.className = 'muted';
      more.textContent = `ほか${events.length - 6}件`;
      cell.append(more);
    }
    grid.append(cell);
  }
}

function installCalendarPanel() {
  const app = q('#app');
  if (!app || q('#calendarOverview')) return;
  const section = document.createElement('section');
  section.id = 'calendarOverview';
  section.className = 'panel tools-panel';
  section.innerHTML = `
    <div class="month-head">
      <div><p class="eyebrow">CALENDAR</p><h2>カレンダー表示</h2></div>
      <div class="month-nav"><button id="monthPrev" class="small" type="button">←</button><strong id="monthLabel"></strong><button id="monthNext" class="small" type="button">→</button></div>
    </div>
    <div id="monthGrid" class="month-grid"><p class="muted">読み込み中…</p></div>`;
  const upcoming = q('#eventList')?.closest('.panel');
  upcoming?.before(section);
  q('#monthPrev').addEventListener('click', () => {
    toolsState.calendarMonth = new Date(toolsState.calendarMonth.getFullYear(), toolsState.calendarMonth.getMonth() - 1, 1);
    renderMonth();
  });
  q('#monthNext').addEventListener('click', () => {
    toolsState.calendarMonth = new Date(toolsState.calendarMonth.getFullYear(), toolsState.calendarMonth.getMonth() + 1, 1);
    renderMonth();
  });
}

function emojiKey(item) { return item.type === 'custom' ? `c:${item.id}` : `u:${item.value}`; }
function customEmoji(id) { return toolsState.bootstrap?.guildEmojis?.find(emoji => emoji.id === id); }

function addDraft(item) {
  const key = emojiKey(item);
  if (toolsState.draft.some(entry => emojiKey(entry) === key)) return;
  if (toolsState.draft.length >= 20) return notice('リアクションは最大20個までです。', true);
  toolsState.draft.push(item);
  renderDraft();
  renderEmojiGrid();
}

function renderDraft() {
  const box = q('#reactionSelected');
  if (!box) return;
  box.replaceChildren();
  for (const item of toolsState.draft) {
    const button = document.createElement('button');
    button.type = 'button';
    if (item.type === 'custom') {
      const emoji = customEmoji(item.id);
      if (emoji) {
        const img = document.createElement('img');
        img.src = emoji.url;
        img.alt = `:${emoji.name}:`;
        button.append(img, `:${emoji.name}: ×`);
      } else button.textContent = `custom:${item.id} ×`;
    } else button.textContent = `${item.value} ×`;
    button.addEventListener('click', () => {
      const key = emojiKey(item);
      toolsState.draft = toolsState.draft.filter(entry => emojiKey(entry) !== key);
      renderDraft();
      renderEmojiGrid();
    });
    box.append(button);
  }
  if (!toolsState.draft.length) box.textContent = '選択なし';
}

function renderEmojiGrid() {
  const standard = q('#standardEmojiGrid');
  const custom = q('#guildEmojiGrid');
  if (!standard || !custom) return;
  standard.replaceChildren();
  for (const value of commonEmoji) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-button';
    button.textContent = value;
    button.classList.toggle('selected', toolsState.draft.some(item => item.type === 'unicode' && item.value === value));
    button.addEventListener('click', () => addDraft({ type:'unicode', value }));
    standard.append(button);
  }
  custom.replaceChildren();
  for (const emoji of toolsState.bootstrap?.guildEmojis || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-button';
    button.title = `:${emoji.name}:`;
    button.classList.toggle('selected', toolsState.draft.some(item => item.type === 'custom' && item.id === emoji.id));
    const img = document.createElement('img');
    img.src = emoji.url;
    img.alt = `:${emoji.name}:`;
    button.append(img);
    button.addEventListener('click', () => addDraft({ type:'custom', id:emoji.id }));
    custom.append(button);
  }
  if (!(toolsState.bootstrap?.guildEmojis || []).length) custom.textContent = 'サーバー固有絵文字はありません。';
}

function renderChannelOptions() {
  const select = q('#reactionChannel');
  if (!select) return;
  select.replaceChildren();
  for (const channel of toolsState.bootstrap?.channels || []) {
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = `#${channel.name}`;
    select.append(option);
  }
}

function ruleEmojiNode(item) {
  if (item.type === 'unicode') return document.createTextNode(item.value);
  const emoji = customEmoji(item.id);
  if (!emoji) return document.createTextNode(`custom:${item.id}`);
  const img = document.createElement('img');
  img.src = emoji.url;
  img.alt = `:${emoji.name}:`;
  img.title = `:${emoji.name}:`;
  return img;
}

function renderRules() {
  const list = q('#reactionRules');
  if (!list) return;
  list.replaceChildren();
  const rules = toolsState.bootstrap?.reactionRules || [];
  if (!rules.length) {
    const p = document.createElement('p'); p.className='muted'; p.textContent='自動リアクション設定はありません。'; list.append(p); return;
  }
  for (const rule of rules) {
    const row = document.createElement('div'); row.className='reaction-rule';
    const main = document.createElement('div');
    const channel = toolsState.bootstrap.channels.find(c => c.id === rule.channelId);
    const title = document.createElement('strong'); title.textContent = `#${channel?.name || rule.channelId} · 「${rule.trigger}」`;
    const emojis = document.createElement('div'); emojis.className='rule-emojis';
    for (const item of rule.emojis || []) emojis.append(ruleEmojiNode(item));
    if (!rule.emojis?.length) emojis.textContent = rule.rawEmojis || 'なし';
    main.append(title, emojis);
    if (rule.invalid) {
      const warn = document.createElement('div'); warn.className='invalid-rule'; warn.textContent='⚠ 現在のDiscordでは使えない絵文字が含まれています。編集してください。'; main.append(warn);
    }
    const actions = document.createElement('div'); actions.className='reaction-actions';
    const edit = document.createElement('button'); edit.type='button'; edit.className='small'; edit.textContent='編集'; edit.addEventListener('click', () => beginRuleEdit(rule));
    const del = document.createElement('button'); del.type='button'; del.className='small danger'; del.textContent='削除'; del.addEventListener('click', () => deleteRule(rule));
    actions.append(edit,del); row.append(main,actions); list.append(row);
  }
}

function beginRuleEdit(rule) {
  toolsState.editing = { channelId:rule.channelId, trigger:rule.trigger };
  q('#reactionChannel').value = rule.channelId;
  q('#reactionTrigger').value = rule.trigger;
  toolsState.draft = Array.isArray(rule.emojis) ? rule.emojis.map(item => ({...item})) : [];
  q('#reactionSave').textContent = '変更を保存';
  q('#reactionCancel').classList.remove('hidden');
  renderDraft(); renderEmojiGrid();
  q('#reactionEditor').scrollIntoView({ behavior:'smooth', block:'center' });
}

function resetRuleEditor() {
  toolsState.editing = null;
  toolsState.draft = [];
  q('#reactionTrigger').value = '';
  q('#reactionSave').textContent = '設定を追加';
  q('#reactionCancel').classList.add('hidden');
  renderDraft(); renderEmojiGrid();
}

async function reloadToolsBootstrap() {
  toolsState.bootstrap = await api('/api/admin/bootstrap');
  renderChannelOptions(); renderEmojiGrid(); renderRules();
}

async function saveRule() {
  const channelId = q('#reactionChannel').value;
  const trigger = q('#reactionTrigger').value.trim();
  if (!trigger) return notice('反応する言葉を入力してください。', true);
  if (!toolsState.draft.length) return notice('絵文字を1つ以上選択してください。', true);
  const payload = { channelId, trigger, emojis:toolsState.draft };
  const endpoint = toolsState.editing ? '/api/admin/reactions/update' : '/api/admin/reactions';
  if (toolsState.editing) Object.assign(payload, { originalChannelId:toolsState.editing.channelId, originalTrigger:toolsState.editing.trigger });
  try {
    const result = await api(endpoint, { method:'POST', body:JSON.stringify(payload) });
    notice(result.backupOk === false ? '保存しました。バックアップのみ失敗しました。' : '自動リアクション設定を保存しました。', result.backupOk === false);
    resetRuleEditor(); await reloadToolsBootstrap();
  } catch (error) { notice(error.message, true); }
}

async function deleteRule(rule) {
  if (!window.confirm(`「${rule.trigger}」の自動リアクション設定を削除しますか？`)) return;
  try {
    await api('/api/admin/reactions/delete', { method:'POST', body:JSON.stringify({ channelId:rule.channelId, trigger:rule.trigger }) });
    notice('自動リアクション設定を削除しました。');
    if (toolsState.editing?.channelId === rule.channelId && toolsState.editing?.trigger === rule.trigger) resetRuleEditor();
    await reloadToolsBootstrap();
  } catch (error) { notice(error.message, true); }
}

function installReactionPanel() {
  const app = q('#app');
  if (!app || q('#reactionPanel')) return;
  const section = document.createElement('section');
  section.id='reactionPanel'; section.className='panel tools-panel';
  section.innerHTML = `
    <div class="section-head"><div><p class="eyebrow">REACTIONS</p><h2>自動リアクション</h2></div></div>
    <div id="reactionEditor" class="reaction-editor">
      <div class="grid two">
        <label><span>対象チャンネル</span><select id="reactionChannel"></select></label>
        <label><span>トリガー文字</span><input id="reactionTrigger" type="text" maxlength="200" placeholder="本文に含まれる文字"></label>
      </div>
      <div class="field-block compact"><span class="field-title">よく使うDiscord絵文字</span><div id="standardEmojiGrid" class="emoji-grid"></div></div>
      <div class="field-block compact"><span class="field-title">このサーバーの絵文字</span><div id="guildEmojiGrid" class="emoji-grid"></div></div>
      <div class="tools-row"><input id="unicodeEmojiInput" type="text" placeholder="その他の絵文字を1個貼り付け"><button id="addUnicodeEmoji" class="small" type="button">追加</button></div>
      <div><span class="field-title">付けるリアクション</span><div id="reactionSelected" class="selected-emojis">選択なし</div></div>
      <p class="hint">標準絵文字は1つのDiscord絵文字として検証し、サーバー固有絵文字は現在このサーバーに存在するものだけ保存します。別サーバーの絵文字IDは登録できません。</p>
      <div class="actions"><button id="reactionSave" class="primary" type="button">設定を追加</button><button id="reactionCancel" class="ghost hidden" type="button">編集をやめる</button></div>
    </div>
    <div class="field-block"><span class="field-title">現在の設定</span><div id="reactionRules"></div></div>`;
  app.append(section);
  q('#reactionSave').addEventListener('click', saveRule);
  q('#reactionCancel').addEventListener('click', resetRuleEditor);
  q('#addUnicodeEmoji').addEventListener('click', () => {
    const input = q('#unicodeEmojiInput');
    const value = input.value.trim();
    if (!value) return;
    addDraft({ type:'unicode', value });
    input.value='';
  });
  q('#unicodeEmojiInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); q('#addUnicodeEmoji').click(); }
  });
}

async function loadCalendarEvents() {
  try {
    const result = await api('/api/admin/events?days=365');
    toolsState.events = result.events || [];
    renderMonth();
  } catch (error) {
    const grid = q('#monthGrid'); if (grid) grid.textContent = error.message;
  }
}

async function init() {
  installStyles();
  const app = q('#app');
  if (!app) return;
  installCalendarPanel();
  installReactionPanel();
  addSearchBox();
  try {
    await reloadToolsBootstrap();
    await loadCalendarEvents();
  } catch (error) {
    if (!String(error.message).includes('ログイン')) notice(error.message, true);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
