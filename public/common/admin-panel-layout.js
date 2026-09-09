function repairAdminPanelLayout() {
  const app = document.querySelector('#app');
  if (!app) return false;

  const calendar = document.querySelector('#calendarOverview');
  const announcement = document.querySelector('#announcementPanel');
  if (announcement && calendar) {
    // Calendar integration settings are folded inside #calendarOverview.
    // The announcement panel must be a sibling of the calendar card, never a
    // child inserted after the folded <details> element.
    if (announcement.parentElement !== app || announcement.previousElementSibling !== calendar) {
      calendar.after(announcement);
    }
  } else if (announcement && announcement.parentElement !== app) {
    app.append(announcement);
  }

  const reaction = document.querySelector('#reactionPanel');
  if (reaction && reaction.parentElement !== app) {
    app.append(reaction);
  }

  return Boolean(announcement && reaction);
}

if (!repairAdminPanelLayout() && window.MutationObserver) {
  const app = document.querySelector('#app') || document.documentElement;
  const observer = new MutationObserver(() => {
    if (repairAdminPanelLayout()) observer.disconnect();
  });
  observer.observe(app, { childList: true, subtree: true });
}
