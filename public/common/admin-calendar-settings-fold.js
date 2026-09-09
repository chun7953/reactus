function foldCalendarSettingsIntoCalendar() {
  const calendar = document.querySelector('#calendarOverview');
  const panel = document.querySelector('#calendarSettingsPanel');
  if (!calendar || !panel) return false;
  if (panel.dataset.reactusFoldedIntoCalendar === '1') return true;

  const details = panel.querySelector('details');
  if (!details) return false;

  const heading = panel.querySelector(':scope > .section-head');
  if (heading) heading.remove();

  const outerHint = panel.querySelector(':scope > .hint');
  const summary = details.querySelector(':scope > summary');
  if (summary) summary.textContent = 'カレンダー連携設定';

  if (outerHint) {
    outerHint.textContent = '普段は変更不要です。Googleカレンダーや投稿先を変更するときだけ開いてください。';
    details.insertBefore(outerHint, summary?.nextSibling || details.firstChild);
  }

  panel.dataset.reactusFoldedIntoCalendar = '1';
  panel.classList.remove('panel');
  panel.classList.add('reactus-calendar-settings-fold');

  const mount = calendar.querySelector('#calendarSettingsMount') || calendar;
  mount.append(panel);
  return true;
}

function installFoldStyles() {
  if (document.querySelector('#reactusCalendarSettingsFoldStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusCalendarSettingsFoldStyles';
  style.textContent = `
    .reactus-calendar-settings-fold{margin-top:14px;padding-top:12px;border-top:1px solid #273341}
    .reactus-calendar-settings-fold details{margin-top:0}
    .reactus-calendar-settings-fold summary{cursor:pointer;font-weight:700;color:#c7d1dc}
    .reactus-calendar-settings-fold details>.hint{margin:10px 0 0}
  `;
  document.head.append(style);
}

function bootCalendarSettingsFold() {
  installFoldStyles();
  foldCalendarSettingsIntoCalendar();
}

bootCalendarSettingsFold();
