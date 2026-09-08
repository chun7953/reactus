const MONTH_DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_VISIBLE_EVENTS = 6;

const monthState = {
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  events: [],
  loadingId: 0,
  gridObserver: null,
};

function mq(selector) {
  return document.querySelector(selector);
}

function monthDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function monthTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function fullDateTime(value) {
  if (!value) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function gridStartForMonth(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  return new Date(month.getFullYear(), month.getMonth(), 1 - first.getDay());
}

function requestWindowForMonth(month) {
  const now = new Date();
  if (sameMonth(month, now)) {
    // Match the legacy month-calendar compatibility window so all current-month
    // callers share one in-flight request through admin-event-fetch-cache.js.
    return { days: 45, pastDays: 40 };
  }

  const start = gridStartForMonth(month);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);
  const days = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / MONTH_DAY_MS) + 1);
  const pastDays = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / MONTH_DAY_MS) + 1);
  return {
    days: Math.min(365, days),
    pastDays: Math.min(365, pastDays),
  };
}

async function monthApi(path) {
  const response = await fetch(path, { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function monitorLabel(event) {
  const option = [...document.querySelectorAll('#monitor option')]
    .find(item => String(item.value) === String(event.monitorId));
  if (option?.textContent) return option.textContent.split(' — ')[0];
  return `#${event.channelId}`;
}

function parseMonthGiveaway(description) {
  const prizes = [];
  const message = [];
  for (const raw of String(description || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^【(.+)\/(\d+)】$/);
    if (match) prizes.push(`${match[1]} × ${match[2]}名`);
    else message.push(line);
  }
  return { prizes, message: message.join('\n') };
}

function ensureMonthTooltip() {
  let tooltip = mq('#reactusMonthTooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'reactusMonthTooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  document.body.append(tooltip);
  return tooltip;
}

function hideMonthTooltip() {
  const tooltip = mq('#reactusMonthTooltip');
  if (tooltip) tooltip.hidden = true;
}

function showMonthTooltip(event, node) {
  const tooltip = ensureMonthTooltip();
  tooltip.replaceChildren();

  const title = document.createElement('div');
  title.className = 'reactus-month-tooltip-title';
  title.textContent = event.summary || 'タイトルなし';

  const meta = document.createElement('div');
  meta.className = 'reactus-month-tooltip-meta';
  const parts = [
    event.type === 'giveaway' ? '抽選' : '通常投稿',
    monitorLabel(event),
    `${fullDateTime(event.start)} → ${fullDateTime(event.end)}`,
  ];
  if (event.recurringEventId) parts.push('繰り返し');
  if (event.hasImage) parts.push('画像あり');
  meta.textContent = parts.join(' · ');

  const body = document.createElement('div');
  body.className = 'reactus-month-tooltip-body';
  if (event.type === 'giveaway') {
    const parsed = parseMonthGiveaway(event.description);
    for (const prize of parsed.prizes) {
      const line = document.createElement('div');
      line.textContent = `🎁 ${prize}`;
      body.append(line);
    }
    if (parsed.message) {
      const text = document.createElement('div');
      text.className = 'reactus-month-tooltip-message';
      text.textContent = parsed.message;
      body.append(text);
    }
  } else {
    body.textContent = event.description || '本文なし';
  }

  tooltip.append(title, meta, body);
  tooltip.hidden = false;
  const rect = node.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = rect.right + 8;
  let top = rect.top;
  if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 8);
  if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function eventNode(event, extraClass = '') {
  const node = document.createElement(event.htmlLink ? 'a' : 'div');
  node.className = `month-event ${event.type === 'giveaway' ? 'giveaway' : ''} ${extraClass}`.trim();
  node.textContent = `${monthTime(event.start)} ${String(event.summary || '').replace(/^【[^】]+】/,'')}`;
  node.dataset.reactusHoverReady = '1';
  if (event.htmlLink) {
    node.href = event.htmlLink;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  node.addEventListener('mouseenter', () => showMonthTooltip(event, node));
  node.addEventListener('focus', () => showMonthTooltip(event, node));
  node.addEventListener('mouseleave', hideMonthTooltip);
  node.addEventListener('blur', hideMonthTooltip);
  return node;
}

function ensureDayDialog() {
  let dialog = mq('#reactusCalendarDayDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'reactusCalendarDayDialog';
  dialog.innerHTML = `
    <div class="reactus-day-dialog-head">
      <strong id="reactusCalendarDayDialogTitle"></strong>
      <button id="reactusCalendarDayDialogClose" type="button" class="small">閉じる</button>
    </div>
    <div id="reactusCalendarDayDialogList" class="reactus-day-dialog-list"></div>`;
  document.body.append(dialog);
  mq('#reactusCalendarDayDialogClose')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function openDayDialog(day, events) {
  const dialog = ensureDayDialog();
  const title = mq('#reactusCalendarDayDialogTitle');
  const list = mq('#reactusCalendarDayDialogList');
  if (!title || !list) return;
  title.textContent = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(day);
  list.replaceChildren();
  for (const event of events) list.append(eventNode(event, 'reactus-day-dialog-event'));
  if (!dialog.open) dialog.showModal();
}

function renderOwnedMonth() {
  const grid = mq('#monthGrid');
  const label = mq('#monthLabel');
  if (!grid || !label) return;

  const y = monthState.month.getFullYear();
  const m = monthState.month.getMonth();
  label.textContent = `${y}年${m + 1}月`;
  grid.replaceChildren();

  const sentinel = document.createElement('span');
  sentinel.hidden = true;
  sentinel.dataset.reactusMonthOwned = '1';
  grid.append(sentinel);

  ['日','月','火','水','木','金','土'].forEach(dayName => {
    const node = document.createElement('div');
    node.className = 'month-weekday';
    node.textContent = dayName;
    grid.append(node);
  });

  const start = gridStartForMonth(monthState.month);
  const todayKey = monthDateKey(new Date());
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'month-day';
    if (day.getMonth() !== m) cell.classList.add('outside');
    if (key === todayKey) cell.classList.add('today');

    const number = document.createElement('div');
    number.className = 'month-num';
    number.textContent = String(day.getDate());
    cell.append(number);

    const events = monthState.events.filter(event => monthDateKey(event.start) === key);
    for (const event of events.slice(0, MONTH_VISIBLE_EVENTS)) cell.append(eventNode(event));
    if (events.length > MONTH_VISIBLE_EVENTS) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'month-more';
      more.textContent = `ほか${events.length - MONTH_VISIBLE_EVENTS}件`;
      more.addEventListener('click', () => openDayDialog(day, events));
      cell.append(more);
    }
    grid.append(cell);
  }
}

function showMonthLoading() {
  const grid = mq('#monthGrid');
  const label = mq('#monthLabel');
  if (label) label.textContent = `${monthState.month.getFullYear()}年${monthState.month.getMonth() + 1}月`;
  if (!grid) return;
  grid.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'muted reactus-month-loading';
  loading.textContent = '読み込み中…';
  grid.append(loading);
}

async function loadOwnedMonth({ quiet = false } = {}) {
  const loadId = ++monthState.loadingId;
  if (!quiet) showMonthLoading();
  const window = requestWindowForMonth(monthState.month);
  try {
    const result = await monthApi(`/api/admin/events?days=${window.days}&pastDays=${window.pastDays}`);
    if (loadId !== monthState.loadingId) return;
    monthState.events = result.events || [];
    renderOwnedMonth();
  } catch (error) {
    if (loadId !== monthState.loadingId) return;
    const grid = mq('#monthGrid');
    if (!grid) return;
    grid.replaceChildren();
    const message = document.createElement('p');
    message.className = 'muted reactus-month-loading';
    message.textContent = error.message;
    grid.append(message);
  }
}

function replaceNavButton(id, delta) {
  const current = mq(id);
  if (!current || current.dataset.reactusMonthNav === '1') return;
  const replacement = current.cloneNode(true);
  replacement.dataset.reactusMonthNav = '1';
  current.replaceWith(replacement);
  replacement.addEventListener('click', () => {
    monthState.month = new Date(
      monthState.month.getFullYear(),
      monthState.month.getMonth() + delta,
      1,
    );
    hideMonthTooltip();
    void loadOwnedMonth();
  });
}

function installMonthStyles() {
  if (mq('#reactusMonthViewStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusMonthViewStyles';
  style.textContent = `
    .month-more{display:block;width:100%;margin:3px 0 0;padding:4px 5px;border:0;border-radius:6px;background:transparent;color:#9fb3c8;text-align:left;font-size:11px;cursor:pointer}
    .month-more:hover,.month-more:focus-visible{background:#172231;color:#eef3f8}
    .reactus-month-loading{grid-column:1/-1;padding:18px;margin:0}
    #reactusMonthTooltip{position:fixed;z-index:10020;max-width:min(390px,calc(100vw - 24px));padding:11px 12px;border:1px solid #354253;border-radius:10px;background:#0e151d;color:#eef3f8;box-shadow:0 12px 36px rgba(0,0,0,.38);font-size:13px;line-height:1.45;white-space:normal;pointer-events:none}
    #reactusMonthTooltip[hidden]{display:none}
    .reactus-month-tooltip-title{font-weight:700;font-size:14px;margin-bottom:5px}
    .reactus-month-tooltip-meta{color:#aab5c2;font-size:12px;margin-bottom:7px}
    .reactus-month-tooltip-body{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:hidden}
    .reactus-month-tooltip-message{margin-top:7px}
    #reactusCalendarDayDialog{width:min(560px,calc(100vw - 28px));max-height:min(78vh,720px);padding:0;border:1px solid #354253;border-radius:14px;background:#0d141c;color:#eef3f8;box-shadow:0 22px 70px rgba(0,0,0,.55)}
    #reactusCalendarDayDialog::backdrop{background:rgba(0,0,0,.58)}
    .reactus-day-dialog-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #293746;background:#0d141c}
    .reactus-day-dialog-list{display:grid;gap:7px;padding:12px 14px 16px;overflow:auto}
    .reactus-day-dialog-event{padding:8px 10px;font-size:13px;white-space:normal}
  `;
  document.head.append(style);
}

function installOwnedMonth() {
  const grid = mq('#monthGrid');
  const label = mq('#monthLabel');
  if (!grid || !label) return false;
  if (grid.dataset.reactusOwnedMonth === '1') return true;
  grid.dataset.reactusOwnedMonth = '1';

  installMonthStyles();
  replaceNavButton('#monthPrev', -1);
  replaceNavButton('#monthNext', 1);

  monthState.gridObserver = new MutationObserver(() => {
    if (!grid.querySelector('[data-reactus-month-owned="1"]') && monthState.events.length) {
      queueMicrotask(renderOwnedMonth);
    }
  });
  monthState.gridObserver.observe(grid, { childList: true });

  document.querySelector('#refreshEvents')?.addEventListener('click', () => void loadOwnedMonth());
  document.querySelector('#scheduleForm')?.addEventListener('submit', () => {
    window.setTimeout(() => void loadOwnedMonth({ quiet: true }), 900);
  });
  window.addEventListener('resize', hideMonthTooltip);
  window.addEventListener('scroll', hideMonthTooltip, true);

  void loadOwnedMonth();
  return true;
}

if (!installOwnedMonth()) {
  const observer = new MutationObserver(() => {
    if (installOwnedMonth()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
