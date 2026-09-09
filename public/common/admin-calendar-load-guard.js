const CALENDAR_STUCK_MS = 40000;
let stuckTimer = null;

function calendarGrid() {
  return document.querySelector('#monthGrid');
}

function calendarLooksResolved() {
  const grid = calendarGrid();
  if (!grid) return false;
  if (grid.querySelector('.month-day')) return true;
  const text = String(grid.textContent || '').trim();
  return Boolean(text && !text.includes('読み込み中'));
}

function clearCalendarGuard() {
  if (stuckTimer !== null) {
    window.clearTimeout(stuckTimer);
    stuckTimer = null;
  }
}

function showCalendarRetry() {
  const grid = calendarGrid();
  if (!grid || calendarLooksResolved()) return;
  grid.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'reactus-calendar-retry';
  wrap.style.gridColumn = '1 / -1';
  wrap.style.padding = '18px';

  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'カレンダーの読み込みに時間がかかっています。';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'small';
  retry.textContent = 'カレンダーを再読み込み';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    retry.textContent = '再読み込み中…';
    const refresh = document.querySelector('#refreshEvents');
    if (refresh) refresh.click();
    else window.location.reload();
    armCalendarGuard();
  });

  wrap.append(message, retry);
  grid.append(wrap);
}

function armCalendarGuard() {
  clearCalendarGuard();
  stuckTimer = window.setTimeout(showCalendarRetry, CALENDAR_STUCK_MS);
}

function watchCalendar() {
  const grid = calendarGrid();
  if (!grid) return false;
  armCalendarGuard();
  if (window.MutationObserver) {
    const observer = new MutationObserver(() => {
      if (calendarLooksResolved()) clearCalendarGuard();
      else if (stuckTimer === null) armCalendarGuard();
    });
    observer.observe(grid, { childList: true, subtree: true, characterData: true });
  }
  return true;
}

if (!watchCalendar() && window.MutationObserver) {
  const observer = new MutationObserver(() => {
    if (watchCalendar()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
