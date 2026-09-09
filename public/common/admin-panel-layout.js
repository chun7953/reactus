function repairAdminPanelLayout() {
  const app = document.querySelector('#app');
  if (!app) return false;

  const announcement = document.querySelector('#announcementPanel');
  if (announcement && announcement.parentElement !== app) {
    app.append(announcement);
  }

  const reaction = document.querySelector('#reactionPanel');
  if (reaction && reaction.parentElement !== app) {
    app.append(reaction);
  }

  return Boolean(announcement || reaction);
}

repairAdminPanelLayout();

if (window.MutationObserver) {
  const observer = new MutationObserver(() => repairAdminPanelLayout());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
