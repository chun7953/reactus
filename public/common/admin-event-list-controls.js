const PAGE_SIZE = 12;
let upcomingLimit = PAGE_SIZE;

function ensureEventSearch() {
  let search = document.querySelector('#eventSearch');
  if (search) return search;

  const refresh = document.querySelector('#refreshEvents');
  const head = refresh?.closest('.section-head');
  if (!refresh || !head) return null;

  search = document.createElement('input');
  search.id = 'eventSearch';
  search.type = 'search';
  search.className = 'calendar-search';
  search.placeholder = '予定を検索';
  search.autocomplete = 'off';
  search.addEventListener('input', applyEventListControls);
  refresh.before(search);
  return search;
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
    applyEventListControls();
  });

  const collapse = document.createElement('button');
  collapse.id = 'upcomingCollapse';
  collapse.type = 'button';
  collapse.className = 'small';
  collapse.textContent = '最初の12件に戻す';
  collapse.addEventListener('click', () => {
    upcomingLimit = PAGE_SIZE;
    applyEventListControls();
    list.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  controls.append(status, more, collapse);
  list.after(controls);
  return controls;
}

function installStyles() {
  if (document.querySelector('#eventListControlsStyles')) return;
  const style = document.createElement('style');
  style.id = 'eventListControlsStyles';
  style.textContent = '.calendar-search{margin-right:auto}';
  document.head.append(style);
}

function applyEventListControls() {
  const list = document.querySelector('#eventList');
  const searchInput = ensureEventSearch();
  const controls = ensureUpcomingControls();
  if (!list || !controls) return;

  const cards = [...list.querySelectorAll(':scope > .event-card')];
  const search = String(searchInput?.value || '').trim().toLocaleLowerCase('ja');
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

function scheduleEventListControlsUpdate() {
  window.queueMicrotask(applyEventListControls);
}

function install() {
  installStyles();
  ensureEventSearch();
  ensureUpcomingControls();
  document.addEventListener('reactus:event-list-rendered', scheduleEventListControlsUpdate);
  applyEventListControls();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
