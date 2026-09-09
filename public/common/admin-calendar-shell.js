const calendarShellQuery = selector => document.querySelector(selector);

function installCalendarShellStyles() {
  if (calendarShellQuery('#reactusCalendarShellStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusCalendarShellStyles';
  style.textContent = `
    .month-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
    .month-nav{display:flex;align-items:center;gap:8px;min-width:0}
    .month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #263240;border-radius:12px;overflow:hidden}
    .month-weekday{padding:7px;text-align:center;font-size:12px;color:#8d9aaa;background:#111820;border-right:1px solid #263240}
    .month-day{min-height:105px;padding:7px;border-top:1px solid #263240;border-right:1px solid #263240;background:#0b1016;overflow:hidden}
    .month-day.outside{opacity:.35}
    .month-day.today{box-shadow:inset 0 0 0 1px #7289ff}
    .month-num{font-size:12px;color:#aab5c2;margin-bottom:5px}
    .month-event{display:block;width:100%;border:0;border-radius:6px;padding:4px 5px;margin:3px 0;background:#172231;color:#eef3f8;text-align:left;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
    .month-event.giveaway{background:#251d35}
    #calendarSettingsMount{margin-top:14px}
    @media(max-width:760px){
      .month-head{align-items:flex-start}
      .month-head h2{width:100%;margin-bottom:2px}
      .month-nav{width:100%;justify-content:space-between}
      .month-nav strong{flex:1;text-align:center;white-space:nowrap}
      .month-grid{grid-template-columns:repeat(7,minmax(0,1fr))}
      .month-weekday{padding:5px 1px;font-size:10px}
      .month-day{min-height:58px;padding:5px 2px}
      .month-num{text-align:center;font-size:11px}
    }
  `;
  document.head.append(style);
}

function installCalendarShell() {
  if (calendarShellQuery('#calendarOverview')) return true;
  const app = calendarShellQuery('#app');
  if (!app) return false;

  installCalendarShellStyles();

  const section = document.createElement('section');
  section.id = 'calendarOverview';
  section.className = 'panel tools-panel';
  section.innerHTML = `
    <div class="month-head">
      <h2>カレンダー</h2>
      <div class="month-nav">
        <button id="monthPrev" class="small" type="button" aria-label="前の月">←</button>
        <strong id="monthLabel"></strong>
        <button id="monthNext" class="small" type="button" aria-label="次の月">→</button>
      </div>
    </div>
    <div id="monthGrid" class="month-grid"><p class="muted reactus-month-loading">読み込み中…</p></div>
    <div id="calendarSettingsMount"></div>`;

  const schedule = calendarShellQuery('#schedulePanel') || app.querySelector(':scope > .panel');
  if (schedule) schedule.before(section);
  else app.prepend(section);

  document.dispatchEvent(new CustomEvent('reactus:calendar-shell-ready'));
  return true;
}

installCalendarShell();
