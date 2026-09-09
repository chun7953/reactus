import { loadMentionConfig, mentionPayload, syncMentionRoleOptions } from './common/admin-mentions.js';

const state = {
  bootstrap: null,
  image: null,
  events: [],
  edit: null,
};

const DESTINATION_TTL_MS = 15_000;
const destinationState = {
  monitors: null,
  loadedAt: 0,
  loading: null,
  preferredMonitorId: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showNotice(message, error = false) {
  const node = $('#notice');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.remove('hidden');
  window.setTimeout(() => node.classList.add('hidden'), 7000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function pad(value) { return String(value).padStart(2, '0'); }

function toInputDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setDefaultTimes() {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30);
  if (start.getTime() <= Date.now()) start.setMinutes(start.getMinutes() + 30);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  $('#startTime').value = toInputDate(start);
  $('#endTime').value = toInputDate(end);
}

function addPrize(name = '', winners = 1) {
  const row = document.createElement('div');
  row.className = 'prize-row';

  const nameLabel = document.createElement('label');
  const nameTitle = document.createElement('span');
  nameTitle.textContent = '景品名';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'prize-name';
  nameInput.value = name;
  nameInput.placeholder = '景品';
  nameInput.maxLength = 200;
  nameLabel.append(nameTitle, nameInput);

  const winnersLabel = document.createElement('label');
  const winnersTitle = document.createElement('span');
  winnersTitle.textContent = '当選人数';
  const winnersInput = document.createElement('input');
  winnersInput.type = 'number';
  winnersInput.className = 'prize-winners';
  winnersInput.min = '1';
  winnersInput.max = '100';
  winnersInput.value = String(winners);
  winnersLabel.append(winnersTitle, winnersInput);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'small danger';
  remove.textContent = '削除';
  remove.addEventListener('click', () => {
    if ($$('.prize-row').length <= 1) return showNotice('景品は1つ以上必要です。', true);
    row.remove();
  });

  row.append(nameLabel, winnersLabel, remove);
  $('#prizeList').append(row);
}

function replacePrizes(prizes = []) {
  $('#prizeList').replaceChildren();
  const values = prizes.length ? prizes : [{ name: '', winners: 1 }];
  values.forEach(prize => addPrize(prize.name || '', prize.winners || 1));
}

function selectedType() {
  return $('#scheduleType').value;
}

function monitorMatchesType(monitor, type) {
  if (monitor.canManage !== true) return false;
  return type === 'giveaway'
    ? monitor.triggerKeyword === 'ラキショ'
    : monitor.triggerKeyword !== 'ラキショ';
}

function monitorLabel(monitor, duplicateChannelIds) {
  const base = `#${monitor.channelName}`;
  if (!duplicateChannelIds.has(String(monitor.channelId))) return base;
  const calendar = String(monitor.calendarName || monitor.calendarId || '').trim();
  return calendar ? `${base} (${calendar})` : `${base} (設定${monitor.id})`;
}

function updateMonitorOptions(preferredMonitorId = null) {
  const type = selectedType();
  const monitorSelect = $('#monitor');
  const previous = String(preferredMonitorId || destinationState.preferredMonitorId || monitorSelect.value || '');
  const source = Array.isArray(destinationState.monitors)
    ? destinationState.monitors
    : (state.bootstrap?.monitors || []);
  const filtered = source.filter(monitor => monitorMatchesType(monitor, type));
  const channelCounts = new Map();
  for (const monitor of filtered) {
    const key = String(monitor.channelId);
    channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
  }
  const duplicateChannelIds = new Set(
    [...channelCounts].filter(([, count]) => count > 1).map(([channelId]) => channelId),
  );

  monitorSelect.replaceChildren();
  for (const monitor of filtered) {
    const option = document.createElement('option');
    option.value = String(monitor.id);
    option.textContent = monitorLabel(monitor, duplicateChannelIds);
    monitorSelect.append(option);
  }

  const matching = [...monitorSelect.options].find(option => option.value === previous);
  if (matching) monitorSelect.value = matching.value;

  if (filtered.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = type === 'giveaway'
      ? '抽選用の投稿先がありません'
      : '通常投稿用の投稿先がありません';
    monitorSelect.append(option);
  }
}

async function refreshMonitorOptions({ force = false, preferredMonitorId = null, silent = false } = {}) {
  if (preferredMonitorId) destinationState.preferredMonitorId = String(preferredMonitorId);

  const fresh = destinationState.monitors
    && (Date.now() - destinationState.loadedAt) < DESTINATION_TTL_MS;
  if (!force && fresh) {
    updateMonitorOptions(preferredMonitorId);
    return destinationState.monitors;
  }

  if (destinationState.loading) {
    try {
      await destinationState.loading;
      updateMonitorOptions(preferredMonitorId);
      return destinationState.monitors;
    } catch {
      return destinationState.monitors;
    }
  }

  const mode = force ? 'refresh' : '1';
  destinationState.loading = api(`/api/admin/bootstrap?channels=${encodeURIComponent(mode)}`)
    .then(result => {
      destinationState.monitors = Array.isArray(result.monitors) ? result.monitors : [];
      destinationState.loadedAt = Date.now();
      state.bootstrap.monitors = destinationState.monitors;
      updateMonitorOptions(preferredMonitorId);
      return destinationState.monitors;
    })
    .catch(error => {
      if (silent) return destinationState.monitors;
      showNotice(`投稿先を更新できませんでした。${error.message ? ` ${error.message}` : ''}`, true);
      throw error;
    })
    .finally(() => {
      destinationState.loading = null;
    });

  return destinationState.loading;
}

function updateType(type) {
  $('#scheduleType').value = type;
  $$('.segment').forEach(button => button.classList.toggle('active', button.dataset.type === type));
  $('#postFields').classList.toggle('hidden', type !== 'post');
  $('#giveawayFields').classList.toggle('hidden', type !== 'giveaway');
  updateMonitorOptions();
}

function updateMention() {
  $('#roleWrap').classList.toggle('hidden', $('#mentionMode').value !== 'role');
}

function updateMonthly() {
  const mode = $('#monthlyMode').value;
  $('#monthlyDayWrap').classList.toggle('hidden', mode !== 'day');
  $('#monthlyWeekdayWrap').classList.toggle('hidden', mode !== 'weekday');
}

function updateRecurrence() {
  const unit = $('#repeatUnit').value;
  const recurring = unit !== 'once';
  $('#intervalWrap').classList.toggle('hidden', !recurring);
  $('#repeatEndModeWrap').classList.toggle('hidden', !recurring);
  $('#weeklyWrap').classList.toggle('hidden', unit !== 'week');
  $('#monthlyWrap').classList.toggle('hidden', unit !== 'month');

  const unitNames = { day: '日', week: '週', month: 'か月', year: '年' };
  $('#intervalUnit').textContent = unitNames[unit] || '';

  const endMode = $('#repeatEndMode').value;
  $('#repeatUntilWrap').classList.toggle('hidden', !recurring || endMode !== 'until');
  $('#repeatCountWrap').classList.toggle('hidden', !recurring || endMode !== 'count');
  updateMonthly();
}

function populateRoles() {
  const select = $('#mentionRole');
  select.replaceChildren();
  for (const role of state.bootstrap.roles) {
    const option = document.createElement('option');
    option.value = role.id;
    option.textContent = `@${role.name}`;
    select.append(option);
  }
  syncMentionRoleOptions();
}

function recurrencePayload() {
  const unit = $('#repeatUnit').value;
  if (unit === 'once') return { unit: 'once', interval: 1 };
  const result = { unit, interval: Number($('#repeatInterval').value || 1) };
  if (unit === 'week') {
    result.weekdays = $$('input[name="weekday"]:checked').map(input => input.value);
  }
  if (unit === 'month') {
    const mode = $('#monthlyMode').value;
    if (mode === 'day') result.monthlyDay = Number($('#monthlyDay').value);
    if (mode === 'lastday') result.monthlyDay = -1;
    if (mode === 'weekday') {
      result.monthlyWeek = $('#monthlyWeek').value;
      result.monthlyWeekday = $('#monthlyWeekday').value;
    }
  }
  const endMode = $('#repeatEndMode').value;
  if (endMode === 'until') result.until = $('#repeatUntil').value;
  if (endMode === 'count') result.count = Number($('#repeatCount').value);
  return result;
}

function fillRecurrence(recurrence = { unit: 'once', interval: 1 }) {
  $('#repeatUnit').value = recurrence.unit || 'once';
  $('#repeatInterval').value = String(recurrence.interval || 1);
  $$('input[name="weekday"]').forEach(input => {
    input.checked = (recurrence.weekdays || []).includes(input.value);
  });

  $('#monthlyMode').value = 'same';
  if (recurrence.monthlyDay === -1) {
    $('#monthlyMode').value = 'lastday';
  } else if (Number.isInteger(recurrence.monthlyDay)) {
    $('#monthlyMode').value = 'day';
    $('#monthlyDay').value = String(recurrence.monthlyDay);
  } else if (recurrence.monthlyWeek && recurrence.monthlyWeekday) {
    $('#monthlyMode').value = 'weekday';
    $('#monthlyWeek').value = recurrence.monthlyWeek;
    $('#monthlyWeekday').value = recurrence.monthlyWeekday;
  }

  if (recurrence.until) {
    $('#repeatEndMode').value = 'until';
    $('#repeatUntil').value = recurrence.until;
  } else if (recurrence.count) {
    $('#repeatEndMode').value = 'count';
    $('#repeatCount').value = String(recurrence.count);
  } else {
    $('#repeatEndMode').value = 'never';
    $('#repeatUntil').value = '';
  }
  updateRecurrence();
}

async function fileToImagePayload(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
  if (file.size > 8 * 1024 * 1024) throw new Error('画像は8MB以下にしてください。');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
  return {
    filename: file.name,
    contentType: file.type,
    base64: String(dataUrl).split(',')[1],
  };
}

function schedulePayload() {
  const type = selectedType();
  const payload = {
    type,
    monitorId: $('#monitor').value,
    startTime: $('#startTime').value,
    mention: mentionPayload(),
    recurrence: recurrencePayload(),
    image: state.image,
  };

  if (type === 'post') {
    payload.title = $('#title').value;
    payload.body = $('#body').value;
    payload.durationMinutes = Number($('#durationMinutes').value || 30);
  } else {
    payload.endTime = $('#endTime').value;
    payload.message = $('#message').value;
    payload.prizes = $$('.prize-row').map(row => ({
      name: row.querySelector('.prize-name').value,
      winners: Number(row.querySelector('.prize-winners').value),
    }));
  }
  return payload;
}

function updatePayload() {
  const base = schedulePayload();
  return {
    ...base,
    calendarId: state.edit.detail.calendarId,
    eventId: state.edit.detail.requestedEventId,
    scope: state.edit.scope,
    imageMode: state.edit.imageMode,
    image: state.edit.imageMode === 'replace' ? state.image : null,
  };
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function editControls() {
  let banner = $('#editBanner');
  if (banner) return banner;
  banner = document.createElement('div');
  banner.id = 'editBanner';
  banner.className = 'field-block compact hidden';

  const title = document.createElement('div');
  title.className = 'field-title-row';
  const text = document.createElement('div');
  const strong = document.createElement('strong');
  strong.id = 'editBannerTitle';
  strong.textContent = '予定を編集中';
  const hint = document.createElement('p');
  hint.id = 'editBannerHint';
  hint.className = 'hint';
  hint.textContent = '保存するまでGoogleカレンダーは変更されません。';
  text.append(strong, hint);

  const cancel = document.createElement('button');
  cancel.id = 'cancelEdit';
  cancel.type = 'button';
  cancel.className = 'small';
  cancel.textContent = '編集をやめる';
  cancel.addEventListener('click', resetCreateMode);
  title.append(text, cancel);

  const scopeWrap = document.createElement('label');
  scopeWrap.id = 'editScopeWrap';
  scopeWrap.className = 'hidden';
  const scopeTitle = document.createElement('span');
  scopeTitle.textContent = '編集範囲';
  const scope = document.createElement('select');
  scope.id = 'editScope';
  const instance = document.createElement('option');
  instance.value = 'instance';
  instance.textContent = 'この回だけ';
  const series = document.createElement('option');
  series.value = 'series';
  series.textContent = '繰り返し全体';
  scope.append(instance, series);
  scope.addEventListener('change', () => reloadEditDetail(scope.value));
  scopeWrap.append(scopeTitle, scope);

  banner.append(title, scopeWrap);
  $('#scheduleForm').before(banner);
  return banner;
}

function setEditorHeading(editing) {
  const panel = $('#scheduleForm').closest('.panel');
  const heading = panel.querySelector('.section-head h2');
  const eyebrow = panel.querySelector('.section-head .eyebrow');
  if (heading) heading.textContent = editing ? '予定を編集' : '予定を作成';
  if (eyebrow) eyebrow.textContent = editing ? 'EDIT SCHEDULE' : 'NEW SCHEDULE';
}

function applyEditRestrictions() {
  const recurringInstance = Boolean(state.edit?.detail?.originalWasRecurring && state.edit.scope === 'instance');
  $$('.recurrence input, .recurrence select').forEach(control => { control.disabled = recurringInstance; });
  $('#image').disabled = recurringInstance;
  $('#clearImage').disabled = recurringInstance;
  $$('.segment').forEach(button => { button.disabled = Boolean(state.edit); });
  $('#monitor').disabled = Boolean(state.edit);

  if (state.edit) {
    const hint = $('#editBannerHint');
    hint.textContent = recurringInstance
      ? 'この回だけでは繰り返し条件と画像は変更できません。全体を選ぶと変更できます。'
      : '保存するまでGoogleカレンダーは変更されません。';
  }
}

function renderEditImageState() {
  $('#image').value = '';
  state.image = null;
  $('#imagePreview').classList.add('hidden');
  $('#imagePreview').removeAttribute('src');

  if (!state.edit) {
    $('#imageName').textContent = 'なし';
    $('#clearImage').classList.add('hidden');
    $('#clearImage').textContent = '外す';
    return;
  }

  const hasImage = state.edit.originalHasImage;
  if (state.edit.imageMode === 'remove') {
    $('#imageName').textContent = '保存時に既存画像を削除';
    $('#clearImage').classList.remove('hidden');
    $('#clearImage').textContent = '削除を取り消す';
  } else if (hasImage) {
    $('#imageName').textContent = '現在の画像あり（変更なし）';
    $('#clearImage').classList.remove('hidden');
    $('#clearImage').textContent = '既存画像を削除';
  } else {
    $('#imageName').textContent = 'なし';
    $('#clearImage').classList.add('hidden');
    $('#clearImage').textContent = '外す';
  }
}

function populateEditForm(detail) {
  updateType(detail.type);
  $('#monitor').value = String(detail.monitorId);
  $('#startTime').value = detail.startTime;

  if (detail.type === 'post') {
    $('#title').value = detail.title || '';
    $('#body').value = detail.body || '';
    $('#durationMinutes').value = String(detail.durationMinutes || 30);
  } else {
    $('#endTime').value = detail.endTime;
    $('#message').value = detail.message || '';
    replacePrizes(detail.prizes || []);
  }

  loadMentionConfig(detail.mention);
  fillRecurrence(detail.recurrence || { unit: 'once', interval: 1 });
  renderEditImageState();
  applyEditRestrictions();
}

async function reloadEditDetail(scope) {
  if (!state.edit) return;
  const source = state.edit.sourceEvent;
  const banner = editControls();
  banner.classList.remove('hidden');
  $('#submitButton').disabled = true;
  $('#submitButton').textContent = '読み込み中…';
  try {
    const params = new URLSearchParams({
      calendarId: source.calendarId,
      eventId: source.id,
      scope,
    });
    const result = await api(`/api/admin/event?${params}`);
    state.edit.scope = scope;
    state.edit.detail = result.event;
    state.edit.originalHasImage = Boolean(result.event.hasImage);
    state.edit.imageMode = 'keep';
    $('#editScope').value = scope;
    $('#editScopeWrap').classList.toggle('hidden', !result.event.originalWasRecurring);
    $('#editBannerTitle').textContent = scope === 'series' ? '繰り返し予定全体を編集中' : '予定を編集中';
    populateEditForm(result.event);
    $('#scheduleForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    $('#submitButton').disabled = false;
    $('#submitButton').textContent = '変更を保存';
  }
}

async function editEvent(event) {
  state.edit = {
    sourceEvent: event,
    scope: 'instance',
    detail: null,
    originalHasImage: false,
    imageMode: 'keep',
  };
  setEditorHeading(true);
  editControls().classList.remove('hidden');
  await reloadEditDetail('instance');
}

document.addEventListener('reactus:edit-event', event => {
  const source = event.detail;
  if (!source?.calendarId || !source?.id) return;
  if (source.monitorId) {
    destinationState.preferredMonitorId = String(source.monitorId);
    void refreshMonitorOptions({
      force: true,
      preferredMonitorId: source.monitorId,
      silent: true,
    });
  }
  void editEvent(source);
});

function resetCreateMode() {
  state.edit = null;
  setEditorHeading(false);
  editControls().classList.add('hidden');
  $('#scheduleForm').reset();
  updateType('post');
  $('#monitor').disabled = false;
  $$('.segment').forEach(button => { button.disabled = false; });
  $$('.recurrence input, .recurrence select').forEach(control => { control.disabled = false; });
  $('#image').disabled = false;
  $('#clearImage').disabled = false;
  replacePrizes();
  setDefaultTimes();
  fillRecurrence({ unit: 'once', interval: 1 });
  updateMention();
  state.image = null;
  renderEditImageState();
  $('#submitButton').textContent = 'Googleカレンダーへ登録';
}

function eventCard(event) {
  const card = document.createElement('div');
  card.className = 'event-card';

  const time = document.createElement('div');
  time.className = 'event-time';
  time.textContent = `${formatDate(event.start)}${event.type === 'giveaway' ? ` → ${formatDate(event.end)}` : ''}`;

  const body = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = event.summary;
  const meta = document.createElement('div');
  meta.className = 'event-meta';
  const monitor = state.bootstrap.monitors.find(m => String(m.id) === String(event.monitorId));
  meta.textContent = `#${monitor?.channelName || event.channelId} · ${event.type === 'giveaway' ? '抽選' : '投稿'}${event.recurringEventId ? ' · 繰り返し' : ''}${event.hasImage ? ' · 画像あり' : ''}`;
  body.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'event-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'small';
  editButton.textContent = '編集';
  editButton.addEventListener('click', () => editEvent(event));
  actions.append(editButton);

  if (event.htmlLink) {
    const open = document.createElement('a');
    open.href = event.htmlLink;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'small';
    open.textContent = 'Googleカレンダーで開く';
    actions.append(open);
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'small danger';
  deleteButton.textContent = '削除';
  deleteButton.addEventListener('click', () => deleteEvent(event));
  actions.append(deleteButton);

  card.append(time, body, actions);
  return card;
}

function notifyEventListRendered() {
  document.dispatchEvent(new CustomEvent('reactus:event-list-rendered'));
}

async function loadEvents({ forceRefresh = false } = {}) {
  const container = $('#eventList');
  container.innerHTML = '<p class="muted">読み込み中…</p>';
  notifyEventListRendered();
  try {
    const refreshQuery = forceRefresh ? '&refresh=1' : '';
    const result = await api(`/api/admin/events?days=90${refreshQuery}`);
    state.events = result.events || [];
    container.replaceChildren();
    if (state.events.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '今後90日以内のReactus予定はありません。';
      container.append(empty);
      return;
    }
    state.events.forEach(event => container.append(eventCard(event)));
  } catch (error) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = error.message;
    container.append(p);
  } finally {
    notifyEventListRendered();
  }
}

async function deleteEvent(event) {
  let scope = 'instance';
  if (event.recurringEventId) {
    const series = window.confirm('繰り返し予定です。\nOK: 繰り返し全体を削除\nキャンセル: この回だけ削除');
    scope = series ? 'series' : 'instance';
  } else if (!window.confirm(`「${event.summary}」を削除しますか？`)) {
    return;
  }
  try {
    await api('/api/admin/delete', {
      method: 'POST',
      body: JSON.stringify({ calendarId: event.calendarId, eventId: event.id, scope }),
    });
    if (state.edit?.sourceEvent?.id === event.id) resetCreateMode();
    showNotice(scope === 'series' ? '繰り返し予定を削除しました。' : '予定を削除しました。');
    await loadEvents();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function initialize() {
  if (new URLSearchParams(location.search).get('login') === 'expired') {
    showNotice('ログインリンクの有効期限が切れています。Discordで `/reactus` から開き直してください。', true);
  }
  try {
    state.bootstrap = await api('/api/admin/bootstrap');
  } catch (error) {
    if (error.status === 401) {
      $('#loginRequired').classList.remove('hidden');
      $('#identity').textContent = 'ログインしていません';
      return;
    }
    showNotice(error.message, true);
    return;
  }

  destinationState.monitors = Array.isArray(state.bootstrap.monitors) ? state.bootstrap.monitors : [];
  destinationState.loadedAt = 0;

  $('#app').classList.remove('hidden');
  $('#identity').textContent = `${state.bootstrap.guild.name} · ${state.bootstrap.user.displayName}`;
  populateRoles();
  editControls();
  resetCreateMode();
  void refreshMonitorOptions({ silent: true });
  await loadEvents();
}

$$('.segment').forEach(button => button.addEventListener('click', () => {
  if (state.edit) return;
  destinationState.preferredMonitorId = null;
  updateType(button.dataset.type);
  void refreshMonitorOptions({ force: true, silent: true });
}));
$('#monitor').addEventListener('focus', () => {
  void refreshMonitorOptions({
    force: true,
    preferredMonitorId: $('#monitor').value,
    silent: true,
  });
});
$('#monitor').addEventListener('change', () => {
  destinationState.preferredMonitorId = $('#monitor').value || null;
});
$('#addPrize').addEventListener('click', () => addPrize());
$('#mentionMode').addEventListener('change', updateMention);
$('#repeatUnit').addEventListener('change', updateRecurrence);
$('#repeatEndMode').addEventListener('change', updateRecurrence);
$('#monthlyMode').addEventListener('change', updateMonthly);
$('#refreshEvents').addEventListener('click', () => void loadEvents({ forceRefresh: true }));

$('#image').addEventListener('change', async (event) => {
  const file = event.target.files?.[0] || null;
  try {
    state.image = await fileToImagePayload(file);
    if (state.edit && file) state.edit.imageMode = 'replace';
    $('#imageName').textContent = file ? `${file.name} (${Math.round(file.size / 1024)}KB)` : 'なし';
    $('#clearImage').classList.toggle('hidden', !file && !(state.edit?.originalHasImage));
    $('#clearImage').textContent = file ? '外す' : (state.edit?.originalHasImage ? '既存画像を削除' : '外す');
    if (file) {
      $('#imagePreview').src = URL.createObjectURL(file);
      $('#imagePreview').classList.remove('hidden');
    } else {
      $('#imagePreview').classList.add('hidden');
    }
  } catch (error) {
    event.target.value = '';
    state.image = null;
    if (state.edit) state.edit.imageMode = 'keep';
    showNotice(error.message, true);
  }
});

$('#clearImage').addEventListener('click', () => {
  $('#image').value = '';
  state.image = null;
  $('#imagePreview').classList.add('hidden');
  $('#imagePreview').removeAttribute('src');

  if (state.edit) {
    if (state.edit.imageMode === 'remove') {
      state.edit.imageMode = 'keep';
    } else if (state.edit.originalHasImage && state.edit.imageMode !== 'replace') {
      state.edit.imageMode = 'remove';
    } else {
      state.edit.imageMode = 'keep';
    }
    renderEditImageState();
    applyEditRestrictions();
    return;
  }

  $('#imageName').textContent = 'なし';
  $('#clearImage').classList.add('hidden');
});

$('#scheduleForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#submitButton');
  button.disabled = true;
  const editing = Boolean(state.edit);
  const original = button.textContent;
  button.textContent = editing ? '保存中…' : '登録中…';
  try {
    if (editing) {
      const result = await api('/api/admin/update', {
        method: 'POST',
        body: JSON.stringify(updatePayload()),
      });
      showNotice(`「${result.event.summary}」の変更を保存しました。`);
      resetCreateMode();
    } else {
      const result = await api('/api/admin/schedules', {
        method: 'POST',
        body: JSON.stringify(schedulePayload()),
      });
      showNotice(`「${result.event.summary}」をGoogleカレンダーへ登録しました。`);
    }
    await loadEvents();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = state.edit ? '変更を保存' : 'Googleカレンダーへ登録';
    if (!state.edit && !editing) button.textContent = original;
  }
});

$('#logoutButton').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  location.reload();
});

void initialize();
