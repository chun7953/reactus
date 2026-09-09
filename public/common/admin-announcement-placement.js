function placeAnnouncementPanelOutsideCalendar() {
  const app = document.querySelector('#app');
  const calendar = document.querySelector('#calendarOverview');
  const announcement = document.querySelector('#announcementPanel');
  if (!app || !calendar || !announcement) return false;

  // Calendar integration settings are now folded inside #calendarOverview.
  // The announcement panel must remain a top-level admin panel; inserting it
  // after the folded <details> would nest it inside the calendar card.
  if (announcement.parentElement !== app || announcement.previousElementSibling !== calendar) {
    calendar.after(announcement);
  }
  return true;
}

function bootAnnouncementPlacement() {
  if (placeAnnouncementPanelOutsideCalendar()) return;
  if (!window.MutationObserver) return;
  const observer = new MutationObserver(() => {
    if (placeAnnouncementPanelOutsideCalendar()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

bootAnnouncementPlacement();
