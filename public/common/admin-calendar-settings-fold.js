function foldCalendarSettingsIntoCalendar() {
  const calendar = document.querySelector('#calendarOverview');
  const panel = document.querySelector('#calendarSettingsPanel');
  if (!calendar || !panel) return false;

  const details = panel.matches('details') ? panel : panel.querySelector('details');
  if (!details) return false;
  if (details.dataset.reactusFoldedIntoCalendar === '1') return true;

  const outerHint = panel.matches('details') ? null : panel.querySelector(':scope > .hint');
  const summary = details.querySelector(':scope > summary');
  if (summary) summary.textContent = 'カレンダー連携設定';

  if (outerHint) {
    outerHint.textContent = '普段は変更不要です。Googleカレンダーや投稿先を変更するときだけ開いてください。';
    details.insertBefore(outerHint, summary?.nextSibling || details.firstChild);
  }

  if (!panel.matches('details')) {
    panel.removeAttribute('id');
    details.id = 'calendarSettingsPanel';
  }
  details.dataset.reactusFoldedIntoCalendar = '1';
  details.classList.add('reactus-calendar-settings-fold');

  const mount = calendar.querySelector('#calendarSettingsMount') || calendar;
  mount.append(details);
  if (panel !== details) panel.remove();
  return true;
}

function installFoldStyles() {
  if (document.querySelector('#reactusCalendarSettingsFoldStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusCalendarSettingsFoldStyles';
  style.textContent = `
    .reactus-calendar-settings-fold{margin-top:14px;padding-top:12px;border-top:1px solid #273341}
    .reactus-calendar-settings-fold>summary{cursor:pointer;font-weight:700;color:#c7d1dc}
    .reactus-calendar-settings-fold>.hint{margin:10px 0 0}
  `;
  document.head.append(style);
}

function bootCalendarSettingsFold() {
  installFoldStyles();
  if (foldCalendarSettingsIntoCalendar()) return;
  if (!window.MutationObserver) return;
  const observer = new MutationObserver(() => {
    if (foldCalendarSettingsIntoCalendar()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

bootCalendarSettingsFold();
