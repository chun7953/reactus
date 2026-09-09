const MOBILE_DAY_QUERY = window.matchMedia('(max-width: 760px)');
let mobileDayLoadId = 0;

function dayInline(selector) {
  return document.querySelector(selector);
}

function installMobileDayInlineStyles() {
  if (dayInline('#reactusMobileDayInlineStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusMobileDayInlineStyles';
  style.textContent = `
    #reactusMobileDayInline{display:none}
    @media(max-width:760px){
      #reactusMobileDayInline{display:block;margin:12px 0 2px;padding:12px;border:1px solid #314153;border-radius:12px;background:#0d151e}
      #reactusMobileDayInline[hidden]{display:none!important}
      .reactus-mobile-day-inline-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
      .reactus-mobile-day-inline-head strong{min-width:0}
      .reactus-mobile-day-inline-list{display:grid;gap:7px}
      .reactus-mobile-day-inline-event{display:block;min-height:44px;padding:10px;border:1px solid #293746;border-radius:9px;background:#172231;color:#eef3f8;text-decoration:none;white-space:normal;overflow-wrap:anywhere}
      .reactus-mobile-day-inline-event.giveaway{background:#251d35}
      .reactus-mobile-day-inline-loading{margin:0;color:#8f9dae}
    }
  `;
  document.head.append(style);
}

function ensureMobileDayInline() {
  let panel = dayInline('#reactusMobileDayInline');
  if (panel) return panel;
  const grid = dayInline('#monthGrid');
  if (!grid) return null;

  panel = document.createElement('section');
  panel.id = 'reactusMobileDayInline';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="reactus-mobile-day-inline-head">
      <strong id="reactusMobileDayInlineTitle">この日の予定</strong>
      <button type="button" class="small" data-close-mobile-day-inline>閉じる</button>
    </div>
    <div id="reactusMobileDayInlineList" class="reactus-mobile-day-inline-list"></div>`;
  grid.after(panel);
  panel.querySelector('[data-close-mobile-day-inline]')?.addEventListener('click', () => {
    panel.hidden = true;
    mobileDayLoadId += 1;
  });
  return panel;
}

function selectedDateForCell(cell) {
  const label = String(dayInline('#monthLabel')?.textContent || '');
  const match = label.match(/(\d{4})年\s*(\d{1,2})月/);
  if (!match) return null;
  const cells = [...document.querySelectorAll('#monthGrid .month-day')];
  const index = cells.indexOf(cell);
  if (index < 0) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const first = new Date(year, monthIndex, 1);
  return new Date(year, monthIndex, 1 - first.getDay() + index);
}

function dateKeyJst(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = {};
  for (const part of parts) values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayTitle(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function eventLabel(item) {
  const time = item?.start
    ? new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(item.start))
    : '';
  const title = String(item?.summary || '予定').replace(/^【[^】]+】/, '');
  return `${time ? `${time} ` : ''}${title}`;
}

function appendPayloadEvent(list, item) {
  const node = document.createElement(item?.htmlLink ? 'a' : 'div');
  node.className = `reactus-mobile-day-inline-event${item?.type === 'giveaway' ? ' giveaway' : ''}`;
  node.textContent = eventLabel(item);
  if (item?.htmlLink) {
    node.href = item.htmlLink;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  list.append(node);
}

function appendRenderedFallback(list, source) {
  const node = document.createElement(source.href ? 'a' : 'div');
  node.className = `reactus-mobile-day-inline-event${source.classList.contains('giveaway') ? ' giveaway' : ''}`;
  node.textContent = source.textContent || '予定';
  if (source.href) {
    node.href = source.href;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  list.append(node);
}

async function openInlineDay(cell) {
  const panel = ensureMobileDayInline();
  const list = dayInline('#reactusMobileDayInlineList');
  const title = dayInline('#reactusMobileDayInlineTitle');
  const selectedDate = selectedDateForCell(cell);
  if (!panel || !list || !title || !selectedDate) return;

  const loadId = ++mobileDayLoadId;
  panel.hidden = false;
  title.textContent = `${dayTitle(selectedDate)}の予定`;
  list.replaceChildren();

  const rendered = [...cell.querySelectorAll('.month-event')];
  for (const source of rendered) appendRenderedFallback(list, source);
  if (!rendered.length) {
    const loading = document.createElement('p');
    loading.className = 'reactus-mobile-day-inline-loading';
    loading.textContent = '予定を確認しています…';
    list.append(loading);
  }

  panel.scrollIntoView({ block: 'nearest' });

  try {
    const response = await fetch('/api/admin/events?days=90&pastDays=45', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    if (loadId !== mobileDayLoadId || panel.hidden) return;

    const key = localDateKey(selectedDate);
    const events = (data.events || []).filter(item => dateKeyJst(item.start) === key);
    list.replaceChildren();
    if (!events.length) {
      const empty = document.createElement('p');
      empty.className = 'reactus-mobile-day-inline-loading';
      empty.textContent = 'この日の予定はありません。';
      list.append(empty);
      return;
    }
    for (const item of events) appendPayloadEvent(list, item);
  } catch {
    if (loadId !== mobileDayLoadId || panel.hidden || rendered.length) return;
    list.replaceChildren();
    const failed = document.createElement('p');
    failed.className = 'reactus-mobile-day-inline-loading';
    failed.textContent = '予定の詳細を読み込めませんでした。';
    list.append(failed);
  }
}

function interceptMobileCalendarBadge(event) {
  if (!MOBILE_DAY_QUERY.matches) return;
  const target = event.target instanceof Element
    ? event.target.closest('.reactus-mobile-event-count')
    : null;
  if (!target) return;
  const cell = target.closest('.month-day');
  if (!cell) return;

  // admin-mobile.js historically opens a <dialog> from this badge. On some
  // Android Chrome builds that modal path can lock up the admin view, so mobile
  // day details now stay inline under the calendar instead.
  event.preventDefault();
  event.stopImmediatePropagation();
  void openInlineDay(cell);
}

installMobileDayInlineStyles();
document.addEventListener('click', interceptMobileCalendarBadge, true);
