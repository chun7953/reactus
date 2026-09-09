const MOBILE_QUERY = window.matchMedia('(max-width: 760px)');

function mobile(selector) {
  return document.querySelector(selector);
}

function installMobileDayDialog() {
  let dialog = mobile('#reactusMobileDayDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'reactusMobileDayDialog';
  dialog.innerHTML = `
    <div class="reactus-mobile-day-head">
      <strong>この日の予定</strong>
      <button type="button" class="small" data-close-mobile-day>閉じる</button>
    </div>
    <div class="reactus-mobile-day-list"></div>`;
  document.body.append(dialog);
  dialog.querySelector('[data-close-mobile-day]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function openCompactDay(cell, eventNodes) {
  const dialog = installMobileDayDialog();
  const list = dialog.querySelector('.reactus-mobile-day-list');
  if (!list) return;
  list.replaceChildren();
  for (const source of eventNodes) {
    const item = document.createElement(source.href ? 'a' : 'div');
    item.className = `reactus-mobile-day-event${source.classList.contains('giveaway') ? ' giveaway' : ''}`;
    item.textContent = source.textContent || '予定';
    if (source.href) {
      item.href = source.href;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
    }
    list.append(item);
  }
  if (!dialog.open) dialog.showModal();
}

function enhanceCalendarForMobile() {
  const grid = mobile('#monthGrid');
  if (!grid) return false;
  const cells = [...grid.querySelectorAll('.month-day')];
  if (!cells.length) return true;

  for (const cell of cells) {
    const eventNodes = [...cell.querySelectorAll('.month-event')];
    const more = cell.querySelector('.month-more');
    const extra = Number(String(more?.textContent || '').match(/(\d+)/)?.[1] || 0);
    const count = eventNodes.length + extra;
    let badge = cell.querySelector('.reactus-mobile-event-count');

    if (!count) {
      badge?.remove();
      cell.classList.remove('reactus-mobile-has-events');
      continue;
    }

    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'reactus-mobile-event-count';
      cell.append(badge);
    }
    if (badge.textContent !== String(count)) badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count}件の予定を表示`);
    cell.classList.add('reactus-mobile-has-events');

    if (badge.dataset.mobileBound !== '1') {
      badge.dataset.mobileBound = '1';
      badge.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!MOBILE_QUERY.matches) return;
        const currentEvents = [...cell.querySelectorAll('.month-event')];
        const currentMore = cell.querySelector('.month-more');
        if (currentMore) {
          currentMore.click();
          return;
        }
        openCompactDay(cell, currentEvents);
      });
    }
  }
  return true;
}

function prepareRecurrenceForMobile() {
  const details = mobile('details.recurrence');
  if (!details || details.dataset.mobilePrepared === '1') return;
  details.dataset.mobilePrepared = '1';
  if (MOBILE_QUERY.matches && mobile('#repeatUnit')?.value === 'once') details.open = false;
  mobile('#repeatUnit')?.addEventListener('change', event => {
    if (MOBILE_QUERY.matches && event.target.value !== 'once') details.open = true;
  });
}

function installStyles() {
  if (mobile('#reactusMobileStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusMobileStyles';
  style.textContent = `
    @media(max-width:760px){
      html{scroll-padding-top:8px}
      body{padding-bottom:env(safe-area-inset-bottom)}
      .shell{width:calc(100% - 12px);padding:10px 0 28px}
      .panel{padding:14px;border-radius:14px;margin-bottom:12px}
      #calendarOverview,.panel{position:relative;overflow:visible}
      #calendarSettingsMount{width:100%;min-width:0}
      .reactus-calendar-settings-fold{width:100%;min-width:0}
      .reactus-calendar-settings-fold .calendar-settings-body{min-width:0}
      .calendar-settings-block,.calendar-settings-row,.calendar-setting-card{max-width:100%;min-width:0}
      .calendar-settings-row>label{min-width:0!important;width:100%}
      .calendar-settings-row input,.calendar-settings-row select{width:100%;min-width:0}
      .topbar{margin-bottom:12px;gap:8px}
      .topbar h1{font-size:1.45rem}
      .topbar .eyebrow{margin-bottom:3px}
      .section-head{margin-bottom:14px;gap:10px;flex-wrap:wrap}
      .section-head>div:first-child{min-width:0}
      button.primary,button.ghost,button.small,.segment,.emoji-button{min-height:44px}
      input[type="text"],input[type="number"],input[type="date"],input[type="datetime-local"],input[type="search"],select,textarea{font-size:16px;min-height:46px}
      textarea{min-height:110px}
      .grid{gap:12px;margin-bottom:12px}
      .field-block{margin:14px 0}
      .field-block.compact{padding:11px}
      .actions{flex-direction:column;align-items:stretch;gap:8px;margin-top:16px}
      .actions button{width:100%;min-width:0}
      .prize-row{grid-template-columns:minmax(0,1fr) 86px!important;align-items:end}
      .prize-row>button{grid-column:1/-1;justify-self:end;min-width:88px}
      .image-preview{max-width:100%;height:auto}
      .weekday-row{justify-content:space-between;gap:4px}
      .weekday-row span{width:38px;height:38px}
      .admin-guide-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;margin-top:10px!important}
      .admin-guide-action{min-height:54px;padding:10px!important}
      .admin-guide-action strong{margin:0!important;font-size:.9rem}
      .admin-guide-action span{display:none!important}
      #eventSearch{width:100%;min-width:0;order:3;margin:4px 0 0}
      #upcomingPagination{display:grid!important;grid-template-columns:1fr auto auto;gap:7px;align-items:center}
      #upcomingPaginationStatus{font-size:.78rem}
      #reactionRuleControls .tools-row,#calendarSettingControls .tools-row{display:grid;grid-template-columns:1fr auto auto;gap:7px;width:100%}
      #reactionRuleControls input,#calendarSettingControls input{width:100%;min-width:0}
      .announcement-pagination{align-items:stretch}
      .announcement-pagination-actions{width:100%}
      .announcement-pagination-actions button{flex:1}
      .announcement-count-row{align-items:flex-start;flex-direction:column;gap:3px}
      .announcement-link-row label{min-width:0!important}
      .announcement-card .event-actions{display:flex;gap:7px}
      .announcement-card .event-actions button{flex:1}
      .month-head{align-items:center;gap:6px}
      .month-nav{gap:4px}
      .month-nav button{min-width:44px;padding:6px}
      .month-grid{grid-template-columns:repeat(7,minmax(0,1fr))!important}
      .month-weekday{display:block!important;padding:5px 1px!important;font-size:10px!important;border-right:1px solid #263240!important}
      .month-day{display:block!important;position:relative;min-height:58px!important;padding:5px 2px!important;border-right:1px solid #263240!important}
      .month-day.outside{display:block!important;opacity:.25}
      .month-num{text-align:center;margin-bottom:2px!important;font-size:11px!important}
      .month-day>.month-event,.month-day>.month-more{display:none!important}
      .reactus-mobile-event-count{display:grid;place-items:center;width:24px;height:24px;min-height:24px;margin:3px auto 0;padding:0;border:1px solid #43536a;border-radius:999px;background:#172231;color:#eef3f8;font-size:11px;font-weight:800}
      .month-day.today .reactus-mobile-event-count{background:#5865f2;border-color:#7289ff}
      #reactusCalendarDayDialog,#reactusMobileDayDialog{width:calc(100vw - 12px)!important;max-height:86dvh!important;margin:auto 6px!important;border-radius:14px!important}
      .reactus-day-dialog-head,.reactus-mobile-day-head{padding:12px!important}
      .reactus-day-dialog-list,.reactus-mobile-day-list{padding:9px 10px 16px!important}
      .reactus-day-dialog-event,.reactus-mobile-day-event{display:block;min-height:44px;padding:11px 10px;border:1px solid #293746;border-radius:9px;background:#172231;color:#eef3f8;text-decoration:none;white-space:normal}
      .reactus-mobile-day-event.giveaway{background:#251d35}
      .reactus-mobile-day-list{display:grid;gap:7px;overflow:auto}
      .reactus-mobile-day-head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #293746;background:#0d141c}
      #reactusMobileDayDialog{padding:0;border:1px solid #354253;background:#0d141c;color:#eef3f8}
      #reactusMobileDayDialog::backdrop{background:rgba(0,0,0,.62)}
      #reactusBackToTop{display:none!important}
    }
    @media(max-width:390px){
      .admin-guide-grid{grid-template-columns:1fr!important}
      .admin-guide-action{min-height:46px}
      #upcomingPagination{grid-template-columns:1fr 1fr}
      #upcomingPaginationStatus{grid-column:1/-1}
      #reactionRuleControls .tools-row,#calendarSettingControls .tools-row{grid-template-columns:1fr 1fr}
      #reactionRuleStatus,#calendarSettingStatus{grid-column:1/-1}
    }
  `;
  document.head.append(style);
}

function install() {
  installStyles();
  prepareRecurrenceForMobile();
  document.addEventListener('reactus:month-rendered', enhanceCalendarForMobile);
  enhanceCalendarForMobile();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
