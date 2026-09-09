const PAGE_SIZE = 12;

let upcomingLimit = PAGE_SIZE;

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

function scheduleUpcomingUpdate() {
  window.queueMicrotask(applyUpcomingLimit);
}

function install() {
  document.addEventListener('reactus:event-list-rendered', scheduleUpcomingUpdate);
  document.querySelector('#eventSearch')?.addEventListener('input', scheduleUpcomingUpdate);
  applyUpcomingLimit();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
