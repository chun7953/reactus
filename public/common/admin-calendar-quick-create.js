import { showAdminNotice } from './admin-notice.js';

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];

function pad(value) { return String(value).padStart(2, '0'); }

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseNaiveDateTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

function formatNaiveDateTime(ms) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function notify(message) {
  showAdminNotice(message, { duration: 5000 });
}

function dispatchInput(node) {
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
}

function roundedJstTime() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  let hours = Number(map.hour || 0);
  let minutes = Number(map.minute || 0);
  minutes = Math.ceil(minutes / 30) * 30;
  if (minutes >= 60) {
    hours = (hours + 1) % 24;
    minutes = 0;
  }
  return `${pad(hours)}:${pad(minutes)}`;
}

function prepareNewSchedule(targetDate) {
  const cancelEdit = q('#cancelEdit');
  if (cancelEdit && !cancelEdit.closest('.hidden') && !cancelEdit.classList.contains('hidden')) {
    cancelEdit.click();
  }

  const startInput = q('#startTime');
  const endInput = q('#endTime');
  const form = q('#scheduleForm');
  if (!startInput || !endInput || !form) return;

  const oldStart = parseNaiveDateTime(startInput.value);
  const oldEnd = parseNaiveDateTime(endInput.value);
  const durationMs = oldStart !== null && oldEnd !== null && oldEnd > oldStart
    ? oldEnd - oldStart
    : 24 * 60 * 60 * 1000;
  const time = String(startInput.value || '').match(/T(\d{2}:\d{2})$/)?.[1] || roundedJstTime();
  const nextStartValue = `${targetDate}T${time}`;
  const nextStart = parseNaiveDateTime(nextStartValue);
  if (nextStart === null) return;

  startInput.value = nextStartValue;
  endInput.value = formatNaiveDateTime(nextStart + durationMs);
  dispatchInput(startInput);
  dispatchInput(endInput);

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const type = q('#scheduleType')?.value || 'post';
  window.setTimeout(() => {
    const focusTarget = type === 'giveaway'
      ? q('#prizeList .prize-name')
      : q('#title');
    focusTarget?.focus();
  }, 350);
  notify(`${targetDate.replaceAll('-', '/')} の予定を作成します。`);
}

function currentCalendarWindow() {
  const label = q('#monthLabel')?.textContent || '';
  const match = label.match(/^(\d{4})年(\d{1,2})月$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const first = new Date(year, month, 1);
  return {
    year,
    month,
    start: new Date(year, month, 1 - first.getDay()),
  };
}

function bindMonthDays() {
  const calendar = currentCalendarWindow();
  if (!calendar) return;
  const cells = qa('#monthGrid .month-day');
  if (!cells.length) return;

  cells.forEach((cell, index) => {
    const day = new Date(
      calendar.start.getFullYear(),
      calendar.start.getMonth(),
      calendar.start.getDate() + index,
    );
    const key = dateKey(day);
    cell.dataset.reactusDate = key;

    let button = cell.querySelector(':scope > .month-add-schedule');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'month-add-schedule';
      button.textContent = '＋';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        prepareNewSchedule(cell.dataset.reactusDate);
      });
      cell.append(button);
    }
    button.title = `${key} に予定を作成`;
    button.setAttribute('aria-label', `${key} に予定を作成`);
  });
}

function goToCurrentMonth() {
  const calendar = currentCalendarWindow();
  if (!calendar) return;
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(nowParts.map(part => [part.type, part.value]));
  const targetYear = Number(map.year);
  const targetMonth = Number(map.month) - 1;
  let difference = (targetYear - calendar.year) * 12 + (targetMonth - calendar.month);
  const button = difference < 0 ? q('#monthPrev') : q('#monthNext');
  difference = Math.abs(difference);
  for (let i = 0; i < difference; i += 1) button?.click();
}

function installTodayButton() {
  const nav = q('#monthLabel')?.closest('.month-nav');
  if (!nav || q('#monthToday')) return;
  const button = document.createElement('button');
  button.id = 'monthToday';
  button.type = 'button';
  button.className = 'small';
  button.textContent = '今日';
  button.addEventListener('click', goToCurrentMonth);
  nav.prepend(button);
}

function installStyles() {
  if (q('#quickCreateStyles')) return;
  const style = document.createElement('style');
  style.id = 'quickCreateStyles';
  style.textContent = `
    .month-day{position:relative}
    .month-add-schedule{position:absolute;top:4px;right:4px;width:24px;height:24px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:#98a7b8;opacity:.18;line-height:20px;font-size:16px}
    .month-day:hover>.month-add-schedule,.month-add-schedule:focus-visible{opacity:1;border-color:#354253;background:#131d28;color:#eef3f8}
    @media(max-width:760px){.month-add-schedule{opacity:.7}}
  `;
  document.head.append(style);
}

function refreshBindings() {
  installTodayButton();
  bindMonthDays();
}

function initialize() {
  installStyles();
  document.addEventListener('reactus:month-rendered', refreshBindings);
  refreshBindings();
}

initialize();

export { formatNaiveDateTime, parseNaiveDateTime };
