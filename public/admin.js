const state = {
  bootstrap: null,
  image: null,
  events: [],
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

function selectedType() {
  return $('#scheduleType').value;
}

function updateMonitorOptions() {
  const type = selectedType();
  const monitorSelect = $('#monitor');
  const previous = monitorSelect.value;
  monitorSelect.replaceChildren();
  const filtered = state.bootstrap.monitors.filter(m => type === 'giveaway' ? m.triggerKeyword === 'ラキショ' : m.triggerKeyword !== 'ラキショ');
  for (const monitor of filtered) {
    const option = document.createElement('option');
    option.value = String(monitor.id);
    option.textContent = `#${monitor.channelName} — ${monitor.triggerKeyword}`;
    monitorSelect.append(option);
  }
  if ([...monitorSelect.options].some(o => o.value === previous)) monitorSelect.value = previous;
  if (filtered.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = type === 'giveaway' ? 'ラキショ用の設定がありません' : '通常投稿用の設定がありません';
    monitorSelect.append(option);
  }
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

function updateMonthly() {
  const mode = $('#monthlyMode').value;
  $('#monthlyDayWrap').classList.toggle('hidden', mode !== 'day');
  $('#monthlyWeekdayWrap').classList.toggle('hidden', mode !== 'weekday');
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
    mention: {
      mode: $('#mentionMode').value,
      roleId: $('#mentionMode').value === 'role' ? $('#mentionRole').value : null,
    },
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

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
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
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'small danger';
  deleteButton.textContent = '削除';
  deleteButton.addEventListener('click', () => deleteEvent(event));
  actions.append(deleteButton);

  card.append(time, body, actions);
  return card;
}

async function loadEvents() {
  const container = $('#eventList');
  container.innerHTML = '<p class="muted">読み込み中…</p>';
  try {
    const result = await api('/api/admin/events?days=90');
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

  $('#app').classList.remove('hidden');
  $('#identity').textContent = `${state.bootstrap.guild.name} · ${state.bootstrap.user.displayName}`;
  populateRoles();
  updateMonitorOptions();
  setDefaultTimes();
  addPrize();
  updateMention();
  updateRecurrence();
  await loadEvents();
}

$$('.segment').forEach(button => button.addEventListener('click', () => updateType(button.dataset.type)));
$('#addPrize').addEventListener('click', () => addPrize());
$('#mentionMode').addEventListener('change', updateMention);
$('#repeatUnit').addEventListener('change', updateRecurrence);
$('#repeatEndMode').addEventListener('change', updateRecurrence);
$('#monthlyMode').addEventListener('change', updateMonthly);
$('#refreshEvents').addEventListener('click', loadEvents);

$('#image').addEventListener('change', async (event) => {
  const file = event.target.files?.[0] || null;
  try {
    state.image = await fileToImagePayload(file);
    $('#imageName').textContent = file ? `${file.name} (${Math.round(file.size / 1024)}KB)` : 'なし';
    $('#clearImage').classList.toggle('hidden', !file);
    if (file) {
      $('#imagePreview').src = URL.createObjectURL(file);
      $('#imagePreview').classList.remove('hidden');
    } else {
      $('#imagePreview').classList.add('hidden');
    }
  } catch (error) {
    event.target.value = '';
    state.image = null;
    showNotice(error.message, true);
  }
});

$('#clearImage').addEventListener('click', () => {
  $('#image').value = '';
  state.image = null;
  $('#imageName').textContent = 'なし';
  $('#clearImage').classList.add('hidden');
  $('#imagePreview').classList.add('hidden');
  $('#imagePreview').removeAttribute('src');
});

$('#scheduleForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#submitButton');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = '登録中…';
  try {
    const result = await api('/api/admin/schedules', {
      method: 'POST',
      body: JSON.stringify(schedulePayload()),
    });
    showNotice(`「${result.event.summary}」をGoogleカレンダーへ登録しました。`);
    await loadEvents();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$('#logoutButton').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  location.reload();
});

void initialize();
