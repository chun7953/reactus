function eventForNode(node) {
  const calendarId = String(node.dataset.reactusCalendarId || '').trim();
  const id = String(node.dataset.reactusEventId || '').trim();
  if (!calendarId || !id) return null;
  return {
    calendarId,
    id,
    summary: String(node.dataset.reactusEventSummary || '').trim(),
  };
}

function bindMonthEvents() {
  document.querySelectorAll(
    '#monthGrid .month-event[data-reactus-event-id][data-reactus-calendar-id]',
  ).forEach(node => {
    if (node.dataset.reactusEditBound === '1') return;
    const source = eventForNode(node);
    if (!source) return;
    node.dataset.reactusEditBound = '1';
    node.title = `${source.summary || '予定'} — クリックでReactus編集（Ctrl/Cmd/ShiftクリックでGoogleを開く）`;
    node.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1) return;
      event.preventDefault();
      document.dispatchEvent(new CustomEvent('reactus:edit-event', { detail: source }));
    });
  });
}

const grid = document.querySelector('#monthGrid');
if (grid) {
  const observer = new MutationObserver(bindMonthEvents);
  observer.observe(grid, { childList: true, subtree: true });
}
bindMonthEvents();
