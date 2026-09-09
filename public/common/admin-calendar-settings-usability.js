const CALENDAR_SETTINGS_PAGE_SIZE = 8;
let calendarSettingsPage = 0;

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function ensureCalendarSettingsControls() {
  const list = document.querySelector('#calendarSettingList');
  if (!list) return null;
  let controls = document.querySelector('#calendarSettingControls');
  if (controls) return controls;

  controls = document.createElement('div');
  controls.id = 'calendarSettingControls';
  controls.style.display = 'grid';
  controls.style.gap = '8px';
  controls.style.marginBottom = '10px';

  const search = document.createElement('input');
  search.id = 'calendarSettingSearch';
  search.type = 'search';
  search.placeholder = '投稿先・カレンダーで検索';
  search.autocomplete = 'off';

  const nav = document.createElement('div');
  nav.className = 'tools-row';
  const prev = document.createElement('button');
  prev.id = 'calendarSettingPrev';
  prev.type = 'button';
  prev.className = 'small';
  prev.textContent = '← 前へ';
  const status = document.createElement('span');
  status.id = 'calendarSettingStatus';
  status.className = 'muted';
  const next = document.createElement('button');
  next.id = 'calendarSettingNext';
  next.type = 'button';
  next.className = 'small';
  next.textContent = '次へ →';

  prev.addEventListener('click', () => {
    calendarSettingsPage = Math.max(0, calendarSettingsPage - 1);
    applyCalendarSettingsPage();
  });
  next.addEventListener('click', () => {
    calendarSettingsPage += 1;
    applyCalendarSettingsPage();
  });
  search.addEventListener('input', () => {
    calendarSettingsPage = 0;
    applyCalendarSettingsPage();
  });

  nav.append(prev, status, next);
  controls.append(search, nav);
  list.before(controls);
  return controls;
}

function applyCalendarSettingsPage() {
  const list = document.querySelector('#calendarSettingList');
  const controls = ensureCalendarSettingsControls();
  if (!list || !controls) return;
  const cards = [...list.querySelectorAll(':scope > .calendar-setting-card')];
  if (!cards.length) {
    controls.hidden = true;
    return;
  }
  controls.hidden = false;

  const query = String(document.querySelector('#calendarSettingSearch')?.value || '')
    .trim()
    .toLocaleLowerCase('ja');
  const matched = cards.filter(card => !query || card.textContent.toLocaleLowerCase('ja').includes(query));
  const totalPages = Math.max(1, Math.ceil(matched.length / CALENDAR_SETTINGS_PAGE_SIZE));
  calendarSettingsPage = Math.min(calendarSettingsPage, totalPages - 1);
  const visible = new Set(matched.slice(
    calendarSettingsPage * CALENDAR_SETTINGS_PAGE_SIZE,
    (calendarSettingsPage + 1) * CALENDAR_SETTINGS_PAGE_SIZE,
  ));
  const matchedSet = new Set(matched);
  for (const card of cards) card.style.display = matchedSet.has(card) && visible.has(card) ? '' : 'none';

  const prev = document.querySelector('#calendarSettingPrev');
  const next = document.querySelector('#calendarSettingNext');
  const status = document.querySelector('#calendarSettingStatus');
  if (prev) prev.disabled = calendarSettingsPage === 0;
  if (next) next.disabled = calendarSettingsPage >= totalPages - 1;
  setText(status, query
    ? `${matched.length}件一致 · ${calendarSettingsPage + 1} / ${totalPages}ページ`
    : `${cards.length}件 · ${calendarSettingsPage + 1} / ${totalPages}ページ`);
}

function installForList() {
  const list = document.querySelector('#calendarSettingList');
  if (!list) return false;
  ensureCalendarSettingsControls();
  document.addEventListener('reactus:calendar-settings-rendered', () => {
    calendarSettingsPage = 0;
    queueMicrotask(applyCalendarSettingsPage);
  });
  applyCalendarSettingsPage();
  return true;
}

installForList();
