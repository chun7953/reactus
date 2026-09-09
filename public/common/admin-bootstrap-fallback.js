const DEGRADED_STARTUP_MS = 9_000;

function bq(selector) {
  return document.querySelector(selector);
}

function loginResolved() {
  const loginRequired = bq('#loginRequired');
  return Boolean(loginRequired && !loginRequired.classList.contains('hidden'));
}

function bootstrapSucceeded() {
  const app = bq('#app');
  const identity = String(bq('#identity')?.textContent || '').trim();
  return Boolean(app && !app.classList.contains('hidden') && identity.includes(' · '));
}

function startupResolved() {
  return loginResolved() || bootstrapSucceeded();
}

function ensureCalendarOverview(app) {
  let section = bq('#calendarOverview');
  if (section) return section;

  section = document.createElement('section');
  section.id = 'calendarOverview';
  section.className = 'panel tools-panel';
  section.innerHTML = `
    <div class="month-head">
      <h2>カレンダー表示</h2>
      <div class="month-nav">
        <button id="monthPrev" class="small" type="button" aria-label="前の月">←</button>
        <strong id="monthLabel"></strong>
        <button id="monthNext" class="small" type="button" aria-label="次の月">→</button>
      </div>
    </div>
    <div id="monthGrid" class="month-grid"><p class="muted">カレンダーを読み込み中…</p></div>`;

  const schedule = bq('#schedulePanel') || app.querySelector(':scope > .panel');
  if (schedule) schedule.before(section);
  else app.prepend(section);
  return section;
}

function hideBootstrapDependentPanels(app) {
  for (const child of app.children) {
    if (child.id === 'calendarOverview') {
      child.classList.remove('reactus-bootstrap-dependent-hidden');
      continue;
    }
    child.classList.add('reactus-bootstrap-dependent-hidden');
  }
}

function removeLoadingOnlyPanels() {
  for (const panel of document.querySelectorAll('main.shell > section.panel, main.shell > div.panel')) {
    if (panel.id === 'reactusDegradedStartup' || panel.id === 'loginRequired') continue;
    const text = String(panel.textContent || '');
    if (text.includes('管理画面を読み込んでいます') && text.includes('Discord')) panel.remove();
  }
}

function showDegradedCalendar() {
  if (startupResolved()) return;

  const app = bq('#app');
  if (!app) return;

  ensureCalendarOverview(app);
  app.classList.remove('hidden');
  app.dataset.reactusDegradedStartup = '1';
  hideBootstrapDependentPanels(app);
  removeLoadingOnlyPanels();

  const identity = bq('#identity');
  if (identity) identity.textContent = '設定情報の読み込みに失敗しました';

  let panel = bq('#reactusDegradedStartup');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'reactusDegradedStartup';
    panel.className = 'panel';
    panel.setAttribute('role', 'alert');
    panel.innerHTML = `
      <h2>設定情報を読み込めませんでした</h2>
      <p class="muted">月カレンダーは設定画面と切り離して読み込みます。予定作成などは、設定情報の再取得後に利用できます。</p>
      <div class="actions">
        <button id="reactusDegradedRetry" class="primary" type="button">再試行</button>
      </div>`;
    app.before(panel);
    bq('#reactusDegradedRetry')?.addEventListener('click', () => window.location.reload());
  }
}

function noticeLooksLikeBootstrapFailure() {
  if (startupResolved()) return false;
  const notice = bq('#notice');
  return Boolean(notice && !notice.classList.contains('hidden') && notice.classList.contains('error'));
}

function installStyles() {
  if (bq('#reactusBootstrapFallbackStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusBootstrapFallbackStyles';
  style.textContent = `
    #reactusDegradedStartup{border-color:#6b5330;background:rgba(40,31,18,.94)}
    .reactus-bootstrap-dependent-hidden{display:none!important}
    @media(max-width:760px){#reactusDegradedStartup .actions button{width:100%;min-width:0}}
  `;
  document.head.append(style);
}

function watchForEarlyFailure() {
  const observer = new MutationObserver(() => {
    if (startupResolved()) {
      observer.disconnect();
      return;
    }
    if (noticeLooksLikeBootstrapFailure()) {
      observer.disconnect();
      showDegradedCalendar();
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}

installStyles();
watchForEarlyFailure();
window.setTimeout(showDegradedCalendar, DEGRADED_STARTUP_MS);
