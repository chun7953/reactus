const ANNOUNCEMENTS_PER_PAGE = 8;

const announcementState = {
  bootstrap: null,
  announcements: [],
  editingChannelId: null,
  page: 0,
};

const aq = selector => document.querySelector(selector);

async function announcementApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    ...options,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function announcementNotice(message, error = false) {
  const node = aq('#notice');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.remove('hidden');
  window.setTimeout(() => node.classList.add('hidden'), 8000);
}

function channelInfo(channelId) {
  return announcementState.bootstrap?.channels?.find(item => String(item.id) === String(channelId)) || null;
}

function channelLabel(channelId) {
  const channel = channelInfo(channelId);
  return channel ? `#${channel.name}` : `#${channelId}`;
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = String(value ?? '');
  option.textContent = label;
  select.append(option);
}

function populateAnnouncementChannels() {
  const target = aq('#announcementChannel');
  const link = aq('#announcementLinkChannel');
  if (!target || !link) return;
  target.replaceChildren();
  link.replaceChildren();
  addOption(target, '', '案内を表示するチャンネルを選択');
  addOption(link, '', '本文に入れるチャンネルを選択');
  for (const channel of announcementState.bootstrap?.channels || []) {
    if (channel.canManage) addOption(target, channel.id, `#${channel.name}`);
    addOption(link, channel.id, `#${channel.name}`);
  }
}

function updateAnnouncementCount() {
  const textarea = aq('#announcementMessage');
  const count = aq('#announcementCount');
  if (!textarea || !count) return;
  count.textContent = `${textarea.value.length} / 2000文字`;
  count.classList.toggle('announcement-count-warning', textarea.value.length > 1900);
}

function appendPreviewText(container, text) {
  const pattern = /<#(\d{15,22})>/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
    const channel = document.createElement('span');
    channel.className = 'announcement-channel-preview';
    channel.textContent = channelLabel(match[1]);
    container.append(channel);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function renderAnnouncementPreview() {
  const textarea = aq('#announcementMessage');
  const preview = aq('#announcementPreview');
  if (!textarea || !preview) return;
  preview.replaceChildren();
  if (!textarea.value) {
    preview.textContent = 'ここにDiscordでの見え方を確認できます。';
    preview.classList.add('muted');
    return;
  }
  preview.classList.remove('muted');
  appendPreviewText(preview, textarea.value);
}

function resetAnnouncementForm() {
  announcementState.editingChannelId = null;
  aq('#announcementForm')?.reset();
  const channel = aq('#announcementChannel');
  if (channel) channel.disabled = false;
  const save = aq('#announcementSave');
  if (save) save.textContent = 'このチャンネルで案内を開始';
  aq('#announcementCancel')?.classList.add('hidden');
  updateAnnouncementCount();
  renderAnnouncementPreview();
}

function startAnnouncementEdit(item) {
  if (!channelInfo(item.channelId)?.canManage) return;
  announcementState.editingChannelId = String(item.channelId);
  aq('#announcementChannel').value = String(item.channelId);
  aq('#announcementChannel').disabled = true;
  aq('#announcementMessage').value = item.message || '';
  aq('#announcementSave').textContent = '変更を保存して表示し直す';
  aq('#announcementCancel').classList.remove('hidden');
  updateAnnouncementCount();
  renderAnnouncementPreview();
  aq('#announcementForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  aq('#announcementMessage').focus();
}

function announcementCard(item) {
  const card = document.createElement('div');
  card.className = 'announcement-card';

  const main = document.createElement('div');
  main.className = 'announcement-card-main';
  const title = document.createElement('strong');
  title.textContent = channelLabel(item.channelId);
  const text = document.createElement('div');
  text.className = 'announcement-card-text';
  appendPreviewText(text, item.message || '');
  main.append(title, text);

  const actions = document.createElement('div');
  actions.className = 'event-actions';
  const manageable = Boolean(channelInfo(item.channelId)?.canManage);
  if (!manageable) {
    const readonly = document.createElement('span');
    readonly.className = 'muted';
    readonly.textContent = '閲覧のみ';
    actions.append(readonly);
  } else {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'small';
    edit.textContent = '編集';
    edit.addEventListener('click', () => startAnnouncementEdit(item));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small danger';
    remove.textContent = '停止';
    remove.addEventListener('click', async () => {
      const ok = window.confirm(
        `${channelLabel(item.channelId)} の「チャンネル下部の案内」を停止しますか？\n\n` +
        '表示中の案内メッセージも削除します。ほかの通常メッセージは削除しません。',
      );
      if (!ok) return;
      remove.disabled = true;
      try {
        await announcementApi('/api/admin/announcements/delete', {
          method: 'POST',
          body: JSON.stringify({ channelId: item.channelId }),
        });
        announcementNotice(`${channelLabel(item.channelId)} の下部案内を停止しました。`);
        if (announcementState.editingChannelId === String(item.channelId)) resetAnnouncementForm();
        await loadAnnouncements();
      } catch (error) {
        remove.disabled = false;
        announcementNotice(error.message, true);
      }
    });
    actions.append(edit, remove);
  }
  card.append(main, actions);
  return card;
}

function renderAnnouncementPagination() {
  const controls = aq('#announcementPagination');
  if (!controls) return;
  const total = announcementState.announcements.length;
  const pageCount = Math.max(1, Math.ceil(total / ANNOUNCEMENTS_PER_PAGE));
  announcementState.page = Math.min(announcementState.page, pageCount - 1);

  const status = aq('#announcementPageStatus');
  const prev = aq('#announcementPrev');
  const next = aq('#announcementNext');
  controls.classList.toggle('hidden', total <= ANNOUNCEMENTS_PER_PAGE);
  if (status) status.textContent = `${announcementState.page + 1} / ${pageCount}ページ · ${total}件`;
  if (prev) prev.disabled = announcementState.page <= 0;
  if (next) next.disabled = announcementState.page >= pageCount - 1;
}

function renderAnnouncementList() {
  const list = aq('#announcementList');
  if (!list) return;
  list.replaceChildren();
  if (!announcementState.announcements.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '現在、表示できるチャンネルには案内が設定されていません。';
    list.append(empty);
    renderAnnouncementPagination();
    return;
  }

  const pageCount = Math.max(1, Math.ceil(announcementState.announcements.length / ANNOUNCEMENTS_PER_PAGE));
  announcementState.page = Math.min(announcementState.page, pageCount - 1);
  const start = announcementState.page * ANNOUNCEMENTS_PER_PAGE;
  const pageItems = announcementState.announcements.slice(start, start + ANNOUNCEMENTS_PER_PAGE);
  for (const item of pageItems) list.append(announcementCard(item));
  renderAnnouncementPagination();
}

async function loadAnnouncements() {
  const result = await announcementApi('/api/admin/announcements');
  announcementState.announcements = result.announcements || [];
  renderAnnouncementList();
}

function insertChannelLink() {
  const select = aq('#announcementLinkChannel');
  const textarea = aq('#announcementMessage');
  if (!select?.value || !textarea) {
    announcementNotice('本文に入れるチャンネルを選んでください。', true);
    return;
  }
  const token = `<#${select.value}>`;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const needsSpaceBefore = before && !/[\s\n]$/.test(before);
  const needsSpaceAfter = after && !/^[\s\n]/.test(after);
  const inserted = `${needsSpaceBefore ? ' ' : ''}${token}${needsSpaceAfter ? ' ' : ''}`;
  textarea.value = before + inserted + after;
  const next = before.length + inserted.length;
  textarea.focus();
  textarea.setSelectionRange(next, next);
  updateAnnouncementCount();
  renderAnnouncementPreview();
}

function installAnnouncementStyles() {
  if (aq('#announcementStyles')) return;
  const style = document.createElement('style');
  style.id = 'announcementStyles';
  style.textContent = `
    .announcement-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:18px;margin-top:16px}
    .announcement-editor{display:grid;gap:14px}
    .announcement-help{padding:12px 14px;border:1px solid #314153;border-radius:10px;background:#0c151e}
    .announcement-help strong{display:block;margin-bottom:5px}
    .announcement-link-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
    .announcement-link-row label{flex:1;min-width:230px}
    .announcement-count-row{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:6px}
    .announcement-count-warning{color:#ffbf69}
    .announcement-preview{min-height:110px;padding:14px;border:1px solid #2a3746;border-radius:10px;background:#111820;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
    .announcement-channel-preview{color:#c9cdfb;background:#3b3f66;border-radius:4px;padding:0 3px}
    .announcement-list{display:grid;gap:9px}
    .announcement-card{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:12px;border:1px solid #293746;border-radius:10px;background:#101821}
    .announcement-card-main{min-width:0;flex:1}
    .announcement-card-text{margin-top:7px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;color:#c7d0db;line-height:1.45}
    .announcement-pagination{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap}
    .announcement-pagination-actions{display:flex;gap:7px}
    @media(max-width:800px){.announcement-layout{grid-template-columns:1fr}.announcement-card{flex-direction:column}.announcement-card .event-actions{width:100%}.announcement-link-row>*{width:100%}}
  `;
  document.head.append(style);
}

function installAnnouncementPanel() {
  if (aq('#announcementPanel')) return true;
  const app = aq('#app');
  if (!app) return false;
  const panel = document.createElement('section');
  panel.id = 'announcementPanel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">チャンネル案内</p>
        <h2>チャンネル下部の案内</h2>
      </div>
    </div>
    <div class="announcement-help">
      <strong>これは何をする機能？</strong>
      <div class="hint">指定したチャンネルに新しいメッセージが投稿されるたび、ここで設定した案内文を一番下へ出し直します。Discordの「ピン留め」とは別の機能です。</div>
    </div>
    <div class="announcement-layout">
      <form id="announcementForm" class="announcement-editor">
        <label>
          <span>案内を表示するチャンネル</span>
          <select id="announcementChannel" required></select>
        </label>
        <label>
          <span>案内文</span>
          <textarea id="announcementMessage" rows="10" maxlength="2000" required placeholder="例：\n質問はこちらのチャンネルへお願いします。\n<#チャンネル> も下のボタンから簡単に入れられます。"></textarea>
          <div class="announcement-count-row"><span class="hint">改行・URL・Discordのチャンネルリンクをそのまま使えます。</span><span id="announcementCount" class="muted">0 / 2000文字</span></div>
        </label>
        <div class="announcement-link-row">
          <label>
            <span>チャンネルへのリンクを本文に入れる</span>
            <select id="announcementLinkChannel"></select>
          </label>
          <button id="announcementInsertChannel" type="button" class="small">選んだチャンネルを挿入</button>
        </div>
        <div>
          <span class="field-title">Discordでの見え方</span>
          <div id="announcementPreview" class="announcement-preview muted">ここにDiscordでの見え方を確認できます。</div>
        </div>
        <div class="actions">
          <button id="announcementSave" type="submit" class="primary">このチャンネルで案内を開始</button>
          <button id="announcementCancel" type="button" class="small hidden">編集をやめる</button>
        </div>
      </form>
      <div>
        <strong>現在設定されている案内</strong>
        <p class="hint">自分が見られるチャンネルの案内だけを表示します。管理権限のないチャンネルは閲覧のみです。</p>
        <div id="announcementList" class="announcement-list"><p class="muted">読み込み中…</p></div>
        <div id="announcementPagination" class="announcement-pagination hidden">
          <span id="announcementPageStatus" class="muted"></span>
          <div class="announcement-pagination-actions">
            <button id="announcementPrev" class="small" type="button">← 前へ</button>
            <button id="announcementNext" class="small" type="button">次へ →</button>
          </div>
        </div>
      </div>
    </div>`;

  const calendar = aq('#calendarOverview');
  if (calendar && calendar.parentElement === app) calendar.after(panel);
  else app.append(panel);
  return true;
}

async function initializeAnnouncements() {
  if (!installAnnouncementPanel()) return false;
  installAnnouncementStyles();
  try {
    announcementState.bootstrap = await announcementApi('/api/admin/bootstrap');
    populateAnnouncementChannels();
    await loadAnnouncements();
  } catch (error) {
    if (!/ログイン/.test(error.message)) announcementNotice(error.message, true);
    return true;
  }

  aq('#announcementPrev').addEventListener('click', () => {
    if (announcementState.page <= 0) return;
    announcementState.page -= 1;
    renderAnnouncementList();
  });
  aq('#announcementNext').addEventListener('click', () => {
    const pageCount = Math.ceil(announcementState.announcements.length / ANNOUNCEMENTS_PER_PAGE);
    if (announcementState.page >= pageCount - 1) return;
    announcementState.page += 1;
    renderAnnouncementList();
  });
  aq('#announcementMessage').addEventListener('input', () => {
    updateAnnouncementCount();
    renderAnnouncementPreview();
  });
  aq('#announcementInsertChannel').addEventListener('click', insertChannelLink);
  aq('#announcementCancel').addEventListener('click', resetAnnouncementForm);
  aq('#announcementForm').addEventListener('submit', async event => {
    event.preventDefault();
    const channelId = announcementState.editingChannelId || aq('#announcementChannel').value;
    const message = aq('#announcementMessage').value;
    const save = aq('#announcementSave');
    save.disabled = true;
    const oldText = save.textContent;
    save.textContent = '保存中…';
    try {
      const result = await announcementApi('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({ channelId, message }),
      });
      const suffix = result.announcement?.warning ? ` ${result.announcement.warning}` : '';
      announcementNotice(`${channelLabel(channelId)} の下部案内を保存しました。${suffix}`, Boolean(result.announcement?.warning));
      await loadAnnouncements();
      resetAnnouncementForm();
    } catch (error) {
      announcementNotice(error.message, true);
    } finally {
      save.disabled = false;
      if (!announcementState.editingChannelId) save.textContent = 'このチャンネルで案内を開始';
      else save.textContent = oldText;
    }
  });
  updateAnnouncementCount();
  renderAnnouncementPreview();
  return true;
}

void initializeAnnouncements();