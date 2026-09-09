const CALENDAR_SETTINGS_PAGE_SIZE = 8;
let calendarSettingsPage = 0;
let calendarSettingsBootstrap = null;
let calendarSettingsListObserver = null;

async function loadCalendarSettingsBootstrap() {
  if (calendarSettingsBootstrap) return calendarSettingsBootstrap;
  const response = await fetch('/api/admin/bootstrap', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  calendarSettingsBootstrap = data;
  return data;
}

function friendlyMonitorType(monitor) {
  return String(monitor?.triggerKeyword || '') === 'ラキショ' ? '抽選' : '通常投稿';
}

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

function clarifyLegacyKeywordField() {
  const input = document.querySelector('#calendarSettingTrigger');
  if (!input) return;
  const label = input.closest('label');
  const title = label?.querySelector('span');
  setText(title, 'Googleカレンダーから直接作る予定の合図');
  input.placeholder = '例: ご連絡';

  const form = document.querySelector('#calendarSettingForm');
  if (!form || form.querySelector('.reactus-calendar-routing-hint')) return;
  const hint = document.createElement('p');
  hint.className = 'hint reactus-calendar-routing-hint';
  hint.textContent = 'Reactus管理画面から予定を作るときは、この合図を意識する必要はありません。Googleカレンダーで予定を直接作る場合だけ使います。抽選は「ラキショ」です。';
  label?.after(hint);
}

async function relabelMonitorCards() {
  const cards = [...document.querySelectorAll('#calendarSettingList > .calendar-setting-card')];
  if (!cards.length) return;
  try {
    const bootstrap = await loadCalendarSettingsBootstrap();
    cards.forEach((card, index) => {
      const monitor = bootstrap.monitors?.[index];
      if (!monitor) return;
      const title = card.querySelector('strong');
      setText(title, `#${monitor.channelName || monitor.channelId} · ${friendlyMonitorType(monitor)}`);
    });
  } catch {
    // The base settings panel handles bootstrap errors.
  }
}

function refreshCalendarSettingsUsability() {
  clarifyLegacyKeywordField();
  ensureCalendarSettingsControls();
  void relabelMonitorCards().then(applyCalendarSettingsPage);
}

function installForList() {
  const list = document.querySelector('#calendarSettingList');
  if (!list) return false;
  if (!calendarSettingsListObserver) {
    calendarSettingsListObserver = new MutationObserver(() => {
      calendarSettingsPage = 0;
      queueMicrotask(refreshCalendarSettingsUsability);
    });
    calendarSettingsListObserver.observe(list, { childList: true });
  }
  refreshCalendarSettingsUsability();
  return true;
}

if (!installForList()) {
  const observer = new MutationObserver(() => {
    if (installForList()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
