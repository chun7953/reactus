const state = {
  events: [],
  byLink: new Map(),
  ready: false,
};

async function loadEvents() {
  try {
    const response = await fetch('/api/admin/events?days=365', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    state.events = data.events || [];
    state.byLink = new Map(state.events.filter(event => event.htmlLink).map(event => [event.htmlLink, event]));
    state.ready = true;
    bindMonthEvents();
  } catch {}
}

function bindMonthEvents() {
  if (!state.ready) return;
  document.querySelectorAll('#monthGrid .month-event[href]').forEach(link => {
    if (link.dataset.reactusEditBound === '1') return;
    const source = state.byLink.get(link.href) || state.byLink.get(link.getAttribute('href'));
    if (!source) return;
    link.dataset.reactusEditBound = '1';
    link.title = `${source.summary || '予定'} — クリックでReactus編集（Ctrl/Cmd/ShiftクリックでGoogleを開く）`;
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1) return;
      event.preventDefault();
      document.dispatchEvent(new CustomEvent('reactus:edit-event', { detail: source }));
    });
  });
}

const observer = new MutationObserver(() => bindMonthEvents());
observer.observe(document.documentElement, { childList: true, subtree: true });
void loadEvents();
