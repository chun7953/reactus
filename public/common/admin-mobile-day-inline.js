import { getMonthEventsForDay } from './admin-calendar-month-view.js';

const MOBILE_DAY_QUERY = window.matchMedia('(max-width: 760px)');

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
      .reactus-mobile-day-inline-list{display:grid;gap:9px}
      .reactus-mobile-day-inline-event{display:grid;gap:5px;min-height:44px;padding:11px;border:1px solid #293746;border-radius:9px;background:#172231;color:#eef3f8;text-decoration:none;white-space:normal;overflow-wrap:anywhere}
      .reactus-mobile-day-inline-event.giveaway{background:#251d35}
      .reactus-mobile-day-inline-title{font-weight:800;line-height:1.35}
      .reactus-mobile-day-inline-meta{font-size:.8rem;color:#aab5c2;line-height:1.4}
      .reactus-mobile-day-inline-body{font-size:.88rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
      .reactus-mobile-day-inline-prize{font-size:.88rem;line-height:1.45}
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
  });
  return panel;
}

function selectedDateForKey(key) {
  const timestamp = Date.parse(`${key}T00:00:00+09:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
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

function dayTitle(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function fullDateTime(value) {
  if (!value) return '日時不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function cleanEventTitle(item) {
  const raw = String(item?.summary || '').trim();
  const cleaned = raw.replace(/^【[^】]+】\s*/, '').trim();
  if (cleaned) return cleaned;
  return item?.type === 'giveaway' ? '抽選' : '予定';
}

function parseGiveaway(description) {
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

function appendPayloadEvent(list, item, selectedKey) {
  const node = document.createElement(item?.htmlLink ? 'a' : 'div');
  node.className = `reactus-mobile-day-inline-event${item?.type === 'giveaway' ? ' giveaway' : ''}`;

  const title = document.createElement('div');
  title.className = 'reactus-mobile-day-inline-title';
  title.textContent = cleanEventTitle(item);

  const meta = document.createElement('div');
  meta.className = 'reactus-mobile-day-inline-meta';
  const startTimestamp = Date.parse(item?.start || '');
  const endTimestamp = Date.parse(item?.end || '');
  const spanning = Number.isFinite(startTimestamp)
    && Number.isFinite(endTimestamp)
    && dateKeyJst(item.start) !== dateKeyJst(new Date(Math.max(startTimestamp + 1, endTimestamp - 1)));
  const parts = [
    item?.type === 'giveaway' ? '抽選' : '通常投稿',
    `${fullDateTime(item?.start)} → ${fullDateTime(item?.end)}`,
  ];
  if (spanning && dateKeyJst(item?.start) !== selectedKey) parts.push('前日から継続');
  if (item?.recurringEventId) parts.push('繰り返し');
  if (item?.hasImage) parts.push('画像あり');
  meta.textContent = parts.join(' · ');

  node.append(title, meta);

  if (item?.type === 'giveaway') {
    const parsed = parseGiveaway(item?.description);
    for (const prize of parsed.prizes) {
      const line = document.createElement('div');
      line.className = 'reactus-mobile-day-inline-prize';
      line.textContent = `🎁 ${prize}`;
      node.append(line);
    }
    if (parsed.message) {
      const body = document.createElement('div');
      body.className = 'reactus-mobile-day-inline-body';
      body.textContent = parsed.message;
      node.append(body);
    }
  } else if (String(item?.description || '').trim()) {
    const body = document.createElement('div');
    body.className = 'reactus-mobile-day-inline-body';
    body.textContent = item.description;
    node.append(body);
  }

  if (item?.htmlLink) {
    node.href = item.htmlLink;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  list.append(node);
}

function openInlineDay(cell) {
  const panel = ensureMobileDayInline();
  const list = dayInline('#reactusMobileDayInlineList');
  const title = dayInline('#reactusMobileDayInlineTitle');
  const key = String(cell.dataset.reactusDate || '').trim();
  const selectedDate = selectedDateForKey(key);
  if (!panel || !list || !title || !selectedDate) return;

  panel.hidden = false;
  title.textContent = `${dayTitle(selectedDate)}の予定`;
  list.replaceChildren();

  const events = getMonthEventsForDay(key);
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'reactus-mobile-day-inline-loading';
    empty.textContent = 'この日の予定はありません。';
    list.append(empty);
  } else {
    for (const item of events) appendPayloadEvent(list, item, key);
  }

  panel.scrollIntoView({ block: 'nearest' });
}

function interceptMobileCalendarBadge(event) {
  if (!MOBILE_DAY_QUERY.matches) return;
  const target = event.target instanceof Element
    ? event.target.closest('.reactus-mobile-event-count')
    : null;
  if (!target) return;
  const cell = target.closest('.month-day');
  if (!cell) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  openInlineDay(cell);
}

installMobileDayInlineStyles();
document.addEventListener('click', interceptMobileCalendarBadge, true);
