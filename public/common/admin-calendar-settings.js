const calendarSettingsState = {
  bootstrap: null,
  editingId: null,
};

const q = selector => document.querySelector(selector);

async function settingsApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    ...options,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function flash(message, error = false) {
  const notice = q('#notice');
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.classList.remove('hidden');
  window.setTimeout(() => notice.classList.add('hidden'), 7000);
}

function roleName(id) {
  const role = calendarSettingsState.bootstrap?.roles?.find(item => String(item.id) === String(id));
  return role ? `@${role.name}` : (id ? `role:${id}` : 'なし');
}

function channelName(id) {
  const channel = calendarSettingsState.bootstrap?.channels?.find(item => String(item.id) === String(id));
  return channel ? `#${channel.name}` : `#${id}`;
}

function option(value, label) {
  const node = document.createElement('option');
  node.value = String(value ?? '');
  node.textContent = label;
  return node;
}

function buildSelectOptions() {
  const channel = q('#calendarSettingChannel');
  const role = q('#calendarSettingRole');
  if (!channel || !role) return;
  channel.replaceChildren(option('', '投稿先チャンネルを選択'));
  for (const item of calendarSettingsState.bootstrap.channels || []) {
    channel.append(option(item.id, `#${item.name}`));
  }
  role.replaceChildren(option('', '既定メンションなし'));
  for (const item of calendarSettingsState.bootstrap.roles || []) {
    role.append(option(item.id, `@${item.name}`));
  }
}

function resetMonitorForm() {
  calendarSettingsState.editingId = null;
  q('#calendarSettingForm')?.reset();
  if (q('#calendarSettingCalendarId')) {
    q('#calendarSettingCalendarId').value = calendarSettingsState.bootstrap?.mainCalendarId || '';
  }
  if (q('#calendarSettingSave')) q('#calendarSettingSave').textContent = '監視設定を追加';
  q('#calendarSettingCancel')?.classList.add('hidden');
}

function startMonitorEdit(monitor) {
  calendarSettingsState.editingId = Number(monitor.id);
  q('#calendarSettingChannel').value = String(monitor.channelId);
  q('#calendarSettingCalendarId').value = monitor.calendarId || '';
  q('#calendarSettingTrigger').value = monitor.triggerKeyword || '';
  q('#calendarSettingRole').value = monitor.defaultMentionRoleId || '';
  q('#calendarSettingSave').textContent = '変更を保存';
  q('#calendarSettingCancel').classList.remove('hidden');
  q('#calendarSettingForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function monitorCard(monitor) {
  const card = document.createElement('div');
  card.className = 'calendar-setting-card';

  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `${channelName(monitor.channelId)} · 【${monitor.triggerKeyword}】`;
  const calendar = document.createElement('div');
  calendar.className = 'muted calendar-setting-id';
  calendar.textContent = monitor.calendarId;
  const mention = document.createElement('div');
  mention.className = 'muted';
  mention.textContent = `既定メンション: ${roleName(monitor.defaultMentionRoleId)}`;
  body.append(title, calendar, mention);

  const actions = document.createElement('div');
  actions.className = 'event-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'small';
  edit.textContent = '編集';
  edit.addEventListener('click', () => startMonitorEdit(monitor));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'small danger';
  remove.textContent = '削除';
  remove.addEventListener('click', async () => {
    const ok = window.confirm(
      `${channelName(monitor.channelId)} の【${monitor.triggerKeyword}】監視設定を削除しますか？\n\n` +
      'Googleカレンダー上の予定は削除されませんが、この設定を使う既存予定はReactusから投稿されなくなります。',
    );
    if (!ok) return;
    try {
      remove.disabled = true;
      await settingsApi('/api/admin/calendar-monitors/delete', {
        method: 'POST',
        body: JSON.stringify({ id: monitor.id }),
      });
      sessionStorage.setItem('reactusSettingsFlash', 'カレンダー監視設定を削除しました。');
      location.reload();
    } catch (error) {
      remove.disabled = false;
      flash(error.message, true);
    }
  });
  actions.append(edit, remove);
  card.append(body, actions);
  return card;
}

function renderMonitors() {
  const list = q('#calendarSettingList');
  if (!list) return;
  list.replaceChildren();
  const monitors = calendarSettingsState.bootstrap?.monitors || [];
  if (!monitors.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'カレンダー監視設定はまだありません。';
    list.append(empty);
    return;
  }
  for (const monitor of monitors) list.append(monitorCard(monitor));
}

function installStyles() {
  if (q('#calendarSettingsStyles')) return;
  const style = document.createElement('style');
  style.id = 'calendarSettingsStyles';
  style.textContent = `
    .calendar-settings-details{margin-top:18px}
    .calendar-settings-details>summary{cursor:pointer;font-weight:700;font-size:1.02rem}
    .calendar-settings-body{display:grid;gap:18px;margin-top:16px}
    .calendar-settings-block{display:grid;gap:10px;padding:14px;border:1px solid #293746;border-radius:12px;background:#0d141c}
    .calendar-settings-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
    .calendar-settings-row>label{flex:1;min-width:220px}
    .calendar-setting-list{display:grid;gap:8px}
    .calendar-setting-card{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:12px;border:1px solid #293746;border-radius:10px;background:#101821}
    .calendar-setting-id{overflow-wrap:anywhere;margin-top:4px}
    @media(max-width:720px){.calendar-setting-card{align-items:flex-start;flex-direction:column}.calendar-setting-card .event-actions{width:100%}}
  `;
  document.head.append(style);
}

function installPanel() {
  if (q('#calendarSettingsPanel')) return true;
  const app = q('#app');
  if (!app) return false;
  const firstPanel = app.querySelector(':scope > .panel');
  if (!firstPanel) return false;

  const panel = document.createElement('section');
  panel.id = 'calendarSettingsPanel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">カレンダー連携</p>
        <h2>カレンダー連携設定</h2>
      </div>
    </div>
    <p class="hint">普段の予定作成では触る必要のない接続設定です。投稿先や、予定を見分ける合図を追加・変更するときだけ使用します。</p>
    <details class="calendar-settings-details">
      <summary>接続設定を開く</summary>
      <div class="calendar-settings-body">
        <div id="mainCalendarSettings" class="calendar-settings-block">
          <strong>メインカレンダー</strong>
          <p class="hint">新しい監視設定を作るときの既定値です。既存の監視設定は自動変更されません。</p>
          <div class="calendar-settings-row">
            <label><span>GoogleカレンダーID</span><input id="mainCalendarIdInput" type="text" autocomplete="off" placeholder="example@gmail.com"></label>
            <button id="saveMainCalendar" type="button" class="small">保存</button>
            <button id="clearMainCalendar" type="button" class="small danger">解除</button>
          </div>
          <p id="mainCalendarPermissionHint" class="hint hidden">メインカレンダーの変更にはサーバー管理者権限が必要です。</p>
        </div>

        <div class="calendar-settings-block">
          <strong>投稿先とカレンダーの設定</strong>
          <form id="calendarSettingForm">
            <div class="grid two">
              <label><span>投稿先チャンネル</span><select id="calendarSettingChannel" required></select></label>
              <label><span>予定を見分ける合図（キーワード）</span><input id="calendarSettingTrigger" maxlength="100" required placeholder="例: ご連絡 / ラキショ"></label>
            </div>
            <div class="grid two">
              <label><span>GoogleカレンダーID</span><input id="calendarSettingCalendarId" required autocomplete="off" placeholder="example@gmail.com"></label>
              <label><span>いつも付けるメンション</span><select id="calendarSettingRole"></select></label>
            </div>
            <p class="hint">抽選用は、予定を見分ける合図を「ラキショ」にします。予定ごとのメンション設定は、予定作成画面でこの既定値を上書きできます。</p>
            <div class="actions">
              <button id="calendarSettingSave" type="submit" class="primary">投稿先の設定を追加</button>
              <button id="calendarSettingCancel" type="button" class="small hidden">編集をやめる</button>
            </div>
          </form>
          <div id="calendarSettingList" class="calendar-setting-list"></div>
        </div>
      </div>
    </details>`;

  firstPanel.after(panel);
  return true;
}

function wirePanel() {
  const bootstrap = calendarSettingsState.bootstrap;
  buildSelectOptions();
  q('#mainCalendarIdInput').value = bootstrap.mainCalendarId || '';
  q('#calendarSettingCalendarId').value = bootstrap.mainCalendarId || '';

  const canMain = Boolean(bootstrap.permissions?.manageMainCalendar);
  q('#mainCalendarIdInput').disabled = !canMain;
  q('#saveMainCalendar').disabled = !canMain;
  q('#clearMainCalendar').disabled = !canMain || !bootstrap.mainCalendarId;
  q('#mainCalendarPermissionHint').classList.toggle('hidden', canMain);

  q('#saveMainCalendar').addEventListener('click', async () => {
    const button = q('#saveMainCalendar');
    try {
      button.disabled = true;
      await settingsApi('/api/admin/main-calendar', {
        method: 'POST',
        body: JSON.stringify({ calendarId: q('#mainCalendarIdInput').value }),
      });
      sessionStorage.setItem('reactusSettingsFlash', 'メインカレンダーを更新しました。');
      location.reload();
    } catch (error) {
      button.disabled = false;
      flash(error.message, true);
    }
  });

  q('#clearMainCalendar').addEventListener('click', async () => {
    if (!window.confirm('メインカレンダーの既定設定を解除しますか？\n既存の監視設定や予定は削除されません。')) return;
    const button = q('#clearMainCalendar');
    try {
      button.disabled = true;
      await settingsApi('/api/admin/main-calendar', {
        method: 'POST',
        body: JSON.stringify({ clear: true }),
      });
      sessionStorage.setItem('reactusSettingsFlash', 'メインカレンダーの既定設定を解除しました。');
      location.reload();
    } catch (error) {
      button.disabled = false;
      flash(error.message, true);
    }
  });

  q('#calendarSettingCancel').addEventListener('click', resetMonitorForm);
  q('#calendarSettingForm').addEventListener('submit', async event => {
    event.preventDefault();
    const save = q('#calendarSettingSave');
    const payload = {
      channelId: q('#calendarSettingChannel').value,
      calendarId: q('#calendarSettingCalendarId').value,
      triggerKeyword: q('#calendarSettingTrigger').value,
      mentionRoleId: q('#calendarSettingRole').value || null,
    };
    if (calendarSettingsState.editingId) payload.id = calendarSettingsState.editingId;
    try {
      save.disabled = true;
      const editing = Boolean(calendarSettingsState.editingId);
      await settingsApi(editing ? '/api/admin/calendar-monitors/update' : '/api/admin/calendar-monitors', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      sessionStorage.setItem('reactusSettingsFlash', editing ? 'カレンダー監視設定を更新しました。' : 'カレンダー監視設定を追加しました。');
      location.reload();
    } catch (error) {
      save.disabled = false;
      flash(error.message, true);
    }
  });

  renderMonitors();
}

async function initializeCalendarSettings() {
  installStyles();
  if (!installPanel()) return;
  try {
    calendarSettingsState.bootstrap = await settingsApi('/api/admin/bootstrap');
    wirePanel();
    const message = sessionStorage.getItem('reactusSettingsFlash');
    if (message) {
      sessionStorage.removeItem('reactusSettingsFlash');
      flash(message);
    }
  } catch (error) {
    const details = q('#calendarSettingsPanel details');
    if (details) {
      details.open = true;
      const body = q('.calendar-settings-body');
      if (body) body.innerHTML = `<p class="muted"></p>`;
      if (body?.firstElementChild) body.firstElementChild.textContent = error.message;
    }
  }
}

void initializeCalendarSettings();
