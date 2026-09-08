const q = selector => document.querySelector(selector);

const historyState = {
  events: [],
  filter: 'past',
  duplicateEvent: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
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

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function installStyles() {
  if (q('#historyStyles')) return;
  const style = document.createElement('style');
  style.id = 'historyStyles';
  style.textContent = `
    .history-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
    .history-toolbar input{min-width:220px;flex:1}
    .history-tabs{display:flex;gap:6px}
    .history-tab.active{border-color:#7289ff;background:#1d2946}
    .history-list{display:grid;gap:8px}
    .history-row{display:grid;grid-template-columns:170px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 0;border-top:1px solid #25303d}
    .history-row:first-child{border-top:0}
    .history-time{font-size:.82rem;color:#9aa8b7}
    .history-title{font-weight:750}
    .history-meta{font-size:.8rem;color:#8492a2;margin-top:3px}
    .history-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
    .history-actions select{width:auto;min-width:130px}
    .history-past{opacity:.78}
    .duplicate-dialog{max-width:520px;width:calc(100% - 32px);border:1px solid #344152;border-radius:14px;background:#121923;color:inherit;padding:0;box-shadow:0 24px 70px #0009}
    .duplicate-dialog::backdrop{background:#0009}
    .duplicate-dialog form{padding:20px;display:grid;gap:14px}
    .duplicate-dialog h3{margin:0}
    .duplicate-dialog .dialog-actions{display:flex;gap:8px;justify-content:flex-end}
    .duplicate-dialog input{width:100%}
    @media(max-width:760px){.history-row{grid-template-columns:1fr}.history-actions{justify-content:flex-start}.history-actions select{width:100%}}
  `;
  document.head.append(style);
}

function currentQuery() {
  return String(q('#historySearch')?.value || '').trim().toLowerCase();
}

function visibleEvents() {
  const needle = currentQuery();
  return historyState.events.filter(event => {
    if (historyState.filter === 'past' && !event.isPast) return false;
    if (historyState.filter === 'future' && event.isPast) return false;
    if (needle) {
      const haystack = `${event.summary || ''}\n${event.description || ''}\n${event.triggerKeyword || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

async function deleteEvent(event, scope) {
  const labels = {
    instance: 'この予定のみ',
    future: 'この予定以降',
    series: 'すべての予定',
  };
  const label = labels[scope] || labels.instance;
  if (!window.confirm(`「${event.summary}」の「${label}」を削除します。よろしいですか？`)) return;
  try {
    const result = await api('/api/admin/delete', {
      method: 'POST',
      body: JSON.stringify({ calendarId: event.calendarId, eventId: event.id, scope }),
    });
    if (result.deletedFuture) notice('選択した回以降の予定を削除しました。');
    else if (result.deletedSeries) notice('定期予定をすべて削除しました。');
    else notice('予定を削除しました。');
    await loadHistory();
    document.querySelector('#refreshEvents')?.click();
  } catch (error) {
    notice(error.message, true);
  }
}

function installDuplicateDialog() {
  if (q('#duplicateDialog')) return q('#duplicateDialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'duplicateDialog';
  dialog.className = 'duplicate-dialog';
  dialog.innerHTML = `
    <form id="duplicateForm">
      <div>
        <p class="eyebrow">DUPLICATE</p>
        <h3>予定を複製</h3>
        <p id="duplicateSummary" class="hint"></p>
      </div>
      <label>
        <span>新しい開始日時</span>
        <input id="duplicateStart" type="datetime-local" required>
      </label>
      <p class="hint">本文・複数景品・当選人数・メンション・画像・予定時間を引き継ぎます。複製先は単発予定として作成します。</p>
      <div class="dialog-actions">
        <button id="duplicateCancel" type="button" class="small">キャンセル</button>
        <button id="duplicateSubmit" type="submit" class="primary">複製する</button>
      </div>
    </form>`;
  document.body.append(dialog);

  q('#duplicateCancel').addEventListener('click', () => {
    historyState.duplicateEvent = null;
    dialog.close();
  });
  dialog.addEventListener('cancel', () => { historyState.duplicateEvent = null; });
  q('#duplicateForm').addEventListener('submit', async event => {
    event.preventDefault();
    const source = historyState.duplicateEvent;
    if (!source) return;
    const startTime = q('#duplicateStart').value;
    if (!startTime) return notice('複製先の開始日時を選択してください。', true);
    const button = q('#duplicateSubmit');
    button.disabled = true;
    button.textContent = '複製中…';
    try {
      const result = await api('/api/admin/duplicate', {
        method: 'POST',
        body: JSON.stringify({ calendarId: source.calendarId, eventId: source.id, startTime }),
      });
      dialog.close();
      historyState.duplicateEvent = null;
      notice(`「${result.event.summary}」を複製しました。`);
      await loadHistory();
      document.querySelector('#refreshEvents')?.click();
    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = '複製する';
    }
  });
  return dialog;
}

function openDuplicateDialog(event) {
  const dialog = installDuplicateDialog();
  historyState.duplicateEvent = event;
  q('#duplicateSummary').textContent = `複製元: ${event.summary || 'タイトルなし'} (${formatDate(event.start)})`;
  q('#duplicateStart').value = '';
  dialog.showModal();
  q('#duplicateStart').focus();
}

function rowFor(event) {
  const row = document.createElement('div');
  row.className = `history-row${event.isPast ? ' history-past' : ''}`;

  const time = document.createElement('div');
  time.className = 'history-time';
  time.textContent = formatDate(event.start);

  const body = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'history-title';
  title.textContent = event.summary || 'タイトルなし';
  const meta = document.createElement('div');
  meta.className = 'history-meta';
  meta.textContent = `${event.type === 'giveaway' ? '抽選' : '投稿'}${event.recurringEventId ? ' · 定期予定' : ''}${event.hasImage ? ' · 画像あり' : ''}${event.isPast ? ' · 終了済み' : ''}`;
  body.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'history-actions';

  const duplicate = document.createElement('button');
  duplicate.type = 'button';
  duplicate.className = 'small';
  duplicate.textContent = '複製';
  duplicate.addEventListener('click', () => openDuplicateDialog(event));
  actions.append(duplicate);

  if (event.htmlLink) {
    const open = document.createElement('a');
    open.href = event.htmlLink;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'small';
    open.textContent = 'Google';
    actions.append(open);
  }

  const scope = document.createElement('select');
  const instance = document.createElement('option');
  instance.value = 'instance';
  instance.textContent = event.recurringEventId ? 'この予定のみ' : 'この予定';
  scope.append(instance);
  if (event.recurringEventId) {
    const future = document.createElement('option');
    future.value = 'future';
    future.textContent = 'これ以降';
    const series = document.createElement('option');
    series.value = 'series';
    series.textContent = 'すべて';
    scope.append(future, series);
  }
  actions.append(scope);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'small danger';
  remove.textContent = '削除';
  remove.addEventListener('click', () => deleteEvent(event, scope.value));
  actions.append(remove);

  row.append(time, body, actions);
  return row;
}

function renderHistory() {
  const list = q('#historyList');
  if (!list) return;
  list.replaceChildren();
  const events = visibleEvents();
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '該当する予定はありません。';
    list.append(empty);
    return;
  }
  const ordered = [...events].sort((a, b) => historyState.filter === 'past'
    ? new Date(b.start) - new Date(a.start)
    : new Date(a.start) - new Date(b.start));
  ordered.forEach(event => list.append(rowFor(event)));
}

async function loadHistory() {
  const list = q('#historyList');
  if (list) list.innerHTML = '<p class="muted">読み込み中…</p>';
  try {
    const result = await api('/api/admin/events?days=365&pastDays=180');
    historyState.events = result.events || [];
    renderHistory();
  } catch (error) {
    if (list) list.innerHTML = `<p class="muted"></p>`;
    if (list?.firstElementChild) list.firstElementChild.textContent = error.message;
  }
}

function installPanel() {
  const app = q('#app');
  if (!app || q('#historyPanel')) return false;
  const section = document.createElement('section');
  section.id = 'historyPanel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="section-head">
      <div><p class="eyebrow">HISTORY</p><h2>予定履歴・管理</h2></div>
      <button id="historyRefresh" class="ghost" type="button">更新</button>
    </div>
    <div class="history-toolbar">
      <div class="history-tabs">
        <button type="button" class="small history-tab active" data-history-filter="past">過去180日</button>
        <button type="button" class="small history-tab" data-history-filter="future">今後1年</button>
        <button type="button" class="small history-tab" data-history-filter="all">すべて</button>
      </div>
      <input id="historySearch" type="search" placeholder="タイトル・本文を検索">
    </div>
    <p class="hint">予定を複製して再利用できます。定期予定は「この予定のみ / これ以降 / すべて」を明示して削除できます。</p>
    <div id="historyList" class="history-list"><p class="muted">読み込み中…</p></div>`;
  app.append(section);

  q('#historyRefresh').addEventListener('click', loadHistory);
  q('#historySearch').addEventListener('input', renderHistory);
  section.querySelectorAll('[data-history-filter]').forEach(button => {
    button.addEventListener('click', () => {
      historyState.filter = button.dataset.historyFilter;
      section.querySelectorAll('.history-tab').forEach(item => item.classList.toggle('active', item === button));
      renderHistory();
    });
  });
  loadHistory();
  return true;
}

installStyles();
installDuplicateDialog();
const observer = new MutationObserver(() => installPanel());
observer.observe(document.documentElement, { childList: true, subtree: true });
installPanel();
