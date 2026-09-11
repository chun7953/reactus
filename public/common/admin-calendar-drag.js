import { showAdminNotice } from './admin-notice.js';

const dragState = {
  source: null,
  suppressClickUntil: 0,
};

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];

function showNotice(message, error = false) {
  showAdminNotice(message, { error });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function dateKey(value) {
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

function cleanTitle(summary) {
  return String(summary || '予定').replace(/^【[^】]+】/, '').trim() || '予定';
}

function eventForNode(node) {
  const calendarId = String(node.dataset.reactusCalendarId || '').trim();
  const id = String(node.dataset.reactusEventId || '').trim();
  const start = String(node.dataset.reactusEventStart || '').trim();
  if (!calendarId || !id || !start) return null;
  return {
    calendarId,
    id,
    start,
    recurringEventId: String(node.dataset.reactusRecurringEventId || '').trim() || null,
    summary: String(node.dataset.reactusEventSummary || '').trim() || node.textContent?.trim() || '予定',
  };
}

function clearTargets() {
  qa('#monthGrid .month-day.drag-target').forEach(cell => cell.classList.remove('drag-target'));
}

function recurringMessage() {
  return '定期予定はドラッグ移動できません。予定をクリックして「この予定のみ / これ以降 / すべて」から編集範囲を選んでください。';
}

async function moveEvent(event, newDate) {
  if (event.recurringEventId) {
    showNotice(recurringMessage(), true);
    return;
  }

  const oldDate = dateKey(event.start);
  if (!newDate || newDate === oldDate) return;

  const title = cleanTitle(event.summary);
  const confirmed = window.confirm(
    `「${title}」を ${newDate.replaceAll('-', '/')} へ移動しますか？\n\n` +
    '開始時刻・本文・メンション・画像はそのまま維持します。',
  );
  if (!confirmed) return;

  try {
    await api('/api/admin/move', {
      method: 'POST',
      body: JSON.stringify({
        calendarId: event.calendarId,
        eventId: event.id,
        newDate,
      }),
    });
    sessionStorage.setItem('reactusCalendarMoveFlash', `「${title}」を ${newDate.replaceAll('-', '/')} へ移動しました。`);
    location.reload();
  } catch (error) {
    showNotice(error.message, true);
  }
}

function bindEvent(node) {
  if (node.dataset.reactusDragBound === '1') return;
  const source = eventForNode(node);
  if (!source) return;

  node.dataset.reactusDragBound = '1';
  node.draggable = true;
  node.classList.toggle('recurring', Boolean(source.recurringEventId));
  if (source.recurringEventId) {
    node.title = `${source.summary || '予定'} — 定期予定はクリックして編集範囲を選択`;
  } else {
    node.title = `${source.summary || '予定'} — クリックで編集 / ドラッグで日付移動`;
  }

  node.addEventListener('dragstart', event => {
    dragState.source = source;
    dragState.suppressClickUntil = Date.now() + 800;
    node.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = source.recurringEventId ? 'none' : 'move';
      event.dataTransfer.setData('text/plain', source.id || 'reactus-event');
    }
  });

  node.addEventListener('dragend', () => {
    node.classList.remove('dragging');
    dragState.source = null;
    dragState.suppressClickUntil = Date.now() + 500;
    clearTargets();
  });

  node.addEventListener('click', event => {
    if (Date.now() < dragState.suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

function bindDay(cell) {
  if (cell.dataset.reactusDropBound === '1') return;
  const targetDate = cell.dataset.reactusDate;
  if (!targetDate) return;
  cell.dataset.reactusDropBound = '1';

  cell.addEventListener('dragenter', event => {
    if (!dragState.source) return;
    event.preventDefault();
    if (!dragState.source.recurringEventId) cell.classList.add('drag-target');
  });

  cell.addEventListener('dragover', event => {
    if (!dragState.source) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = dragState.source.recurringEventId ? 'none' : 'move';
    }
  });

  cell.addEventListener('dragleave', event => {
    if (event.relatedTarget && cell.contains(event.relatedTarget)) return;
    cell.classList.remove('drag-target');
  });

  cell.addEventListener('drop', event => {
    if (!dragState.source) return;
    event.preventDefault();
    event.stopPropagation();
    const source = dragState.source;
    dragState.source = null;
    dragState.suppressClickUntil = Date.now() + 800;
    clearTargets();
    if (source.recurringEventId) {
      showNotice(recurringMessage(), true);
      return;
    }
    void moveEvent(source, cell.dataset.reactusDate);
  });
}

function bindMonth() {
  qa('#monthGrid .month-event[data-reactus-event-id][data-reactus-calendar-id]').forEach(bindEvent);
  qa('#monthGrid .month-day[data-reactus-date]').forEach(bindDay);
}

function installStyles() {
  if (q('#calendarDragStyles')) return;
  const style = document.createElement('style');
  style.id = 'calendarDragStyles';
  style.textContent = `
    .month-event[draggable="true"]{cursor:grab}
    .month-event.dragging{opacity:.45;cursor:grabbing}
    .month-event.recurring{cursor:pointer}
    .month-day.drag-target{box-shadow:inset 0 0 0 2px #7289ff;background:#111a27}
  `;
  document.head.append(style);
}

function initialize() {
  installStyles();
  const flash = sessionStorage.getItem('reactusCalendarMoveFlash');
  if (flash) {
    sessionStorage.removeItem('reactusCalendarMoveFlash');
    showNotice(flash);
  }
  document.addEventListener('reactus:month-rendered', bindMonth);
  bindMonth();
}

initialize();
