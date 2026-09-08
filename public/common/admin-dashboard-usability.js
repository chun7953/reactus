const PAGE_SIZE = 12;

const calendarState = {
  events: [],
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  ready: false,
  loading: false,
};

let upcomingLimit = PAGE_SIZE;
let upcomingObserver = null;

async function api(path) {
  const response = await fetch(path, { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function jstDateKey(value) {
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

function jstTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function monthFromLabel() {
  const match = String(document.querySelector('#monthLabel')?.textContent || '').match(/^(\d{4})年(\d{1,2})月$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function cleanSummary(value) {
  return String(value || '').replace(/^【[^】]+】/, '');
}

function renderCalendar() {
  const grid = document.querySelector('#monthGrid');
  const label = document.querySelector('#monthLabel');
  if (!grid || !label || !calendarState.ready) return;

  const y = calendarState.month.getFullYear();
  const m = calendarState.month.getMonth();
  label.textContent = `${y}年${m + 1}月`;
  grid.replaceChildren();

  for (const weekday of ['日', '月', '火', '水', '木', '金', '土']) {
    const node = document.createElement('div');
    node.className = 'month-weekday';
    node.textContent = weekday;
    grid.append(node);
  }

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const todayKey = jstDateKey(new Date());

  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const cell = document.createElement('div');
    cell.className = 'month-day';
    if (day.getMonth() !== m) cell.classList.add('outside');
    if (key === todayKey) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'month-num';
    num.textContent = String(day.getDate());
    cell.append(num);

    const events = calendarState.events.filter(event => jstDateKey(event.start) === key);
    for (const event of events.slice(0, 6)) {
      const node = document.createElement(event.htmlLink ? 'a' : 'div');
      node.className = `month-event ${event.type === 'giveaway' ? 'giveaway' : ''}`;
      node.textContent = `${jstTime(event.start)} ${cleanSummary(event.summary)}`;
      node.title = event.summary || '';
      if (event.htmlLink) {
        node.href = event.htmlLink;
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
      }
      cell.append(node);
    }

    if (events.length > 6) {
      const more = document.createElement('div');
      more.className = 'muted';
      more.textContent = `ほか${events.length - 6}件`;
      cell.append(more);
    }
    grid.append(cell);
  }

  document.dispatchEvent(new CustomEvent('reactus:calendar-rendered', {
    detail: { events: calendarState.events, year: y, month: m + 1 },
  }));
}

function showCalendarError(message) {
  const grid = document.querySelector('#monthGrid');
  if (!grid) return;
  const wrap = document.createElement('div');
  wrap.className = 'field-block compact';
  const text = document.createElement('p');
  text.className = 'muted';
  text.textContent = `カレンダーを読み込めませんでした。${message ? ` ${message}` : ''}`;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'small';
  retry.textContent = '再読み込み';
  retry.addEventListener('click', () => void refreshCalendar());
  wrap.append(text, retry);
  grid.replaceChildren(wrap);
}

async function refreshCalendar() {
  if (calendarState.loading) return;
  const grid = document.querySelector('#monthGrid');
  if (!grid) return;
  calendarState.loading = true;
  if (!calendarState.ready) grid.innerHTML = '<p class="muted">予定を読み込み中…</p>';
  try {
    const result = await api('/api/admin/events?days=365&pastDays=45');
    calendarState.events = result.events || [];
    const displayedMonth = monthFromLabel();
    if (displayedMonth) calendarState.month = displayedMonth;
    calendarState.ready = true;
    renderCalendar();
  } catch (error) {
    if (!calendarState.ready) showCalendarError(error.message);
  } finally {
    calendarState.loading = false;
  }
}

function changeMonth(offset) {
  if (!calendarState.ready) return;
  calendarState.month = new Date(
    calendarState.month.getFullYear(),
    calendarState.month.getMonth() + offset,
    1,
  );
  renderCalendar();
}

function goToday() {
  const now = new Date();
  calendarState.month = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
}

function ownCalendarNavigation(event) {
  if (!calendarState.ready) return;
  const id = event.target?.id;
  if (!['monthPrev', 'monthNext', 'monthToday'].includes(id)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (id === 'monthPrev') changeMonth(-1);
  else if (id === 'monthNext') changeMonth(1);
  else goToday();
}

function ensureUpcomingControls() {
  const list = document.querySelector('#eventList');
  if (!list) return null;
  let controls = document.querySelector('#upcomingPagination');
  if (controls) return controls;

  controls = document.createElement('div');
  controls.id = 'upcomingPagination';
  controls.className = 'tools-row';
  controls.style.marginTop = '12px';

  const status = document.createElement('span');
  status.id = 'upcomingPaginationStatus';
  status.className = 'muted';

  const more = document.createElement('button');
  more.id = 'upcomingMore';
  more.type = 'button';
  more.className = 'small';
  more.textContent = `さらに${PAGE_SIZE}件表示`;
  more.addEventListener('click', () => {
    upcomingLimit += PAGE_SIZE;
    applyUpcomingLimit();
  });

  const collapse = document.createElement('button');
  collapse.id = 'upcomingCollapse';
  collapse.type = 'button';
  collapse.className = 'small';
  collapse.textContent = '最初の12件に戻す';
  collapse.addEventListener('click', () => {
    upcomingLimit = PAGE_SIZE;
    applyUpcomingLimit();
    list.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  controls.append(status, more, collapse);
  list.after(controls);
  return controls;
}

function applyUpcomingLimit() {
  const list = document.querySelector('#eventList');
  const controls = ensureUpcomingControls();
  if (!list || !controls) return;
  const cards = [...list.querySelectorAll(':scope > .event-card')];
  const search = String(document.querySelector('#eventSearch')?.value || '').trim().toLocaleLowerCase('ja');
  const status = controls.querySelector('#upcomingPaginationStatus');
  const more = controls.querySelector('#upcomingMore');
  const collapse = controls.querySelector('#upcomingCollapse');

  if (!cards.length) {
    controls.hidden = true;
    return;
  }
  controls.hidden = false;

  if (search) {
    let matched = 0;
    for (const card of cards) {
      const visible = card.textContent.toLocaleLowerCase('ja').includes(search);
      card.style.display = visible ? '' : 'none';
      if (visible) matched += 1;
    }
    status.textContent = `${matched}件が一致`;
    more.hidden = true;
    collapse.hidden = true;
    return;
  }

  cards.forEach((card, index) => {
    card.style.display = index < upcomingLimit ? '' : 'none';
  });
  const shown = Math.min(upcomingLimit, cards.length);
  status.textContent = `${shown} / ${cards.length}件を表示`;
  more.hidden = shown >= cards.length;
  if (!more.hidden) more.textContent = `さらに${Math.min(PAGE_SIZE, cards.length - shown)}件表示`;
  collapse.hidden = shown <= PAGE_SIZE;
}

function watchUpcomingList() {
  const list = document.querySelector('#eventList');
  if (!list || upcomingObserver) return;
  upcomingObserver = new MutationObserver(() => window.queueMicrotask(applyUpcomingLimit));
  upcomingObserver.observe(list, { childList: true });
  document.querySelector('#eventSearch')?.addEventListener('input', () => window.queueMicrotask(applyUpcomingLimit));
  applyUpcomingLimit();
}

function install() {
  document.addEventListener('click', ownCalendarNavigation, true);
  document.querySelector('#refreshEvents')?.addEventListener('click', () => void refreshCalendar());
  document.querySelector('#scheduleForm')?.addEventListener('submit', () => {
    window.setTimeout(() => void refreshCalendar(), 900);
  });
  watchUpcomingList();
  void refreshCalendar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
