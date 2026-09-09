const DEGRADED_STARTUP_MS = 11_000;

function bq(selector) {
  return document.querySelector(selector);
}

function startupResolved() {
  const app = bq('#app');
  const loginRequired = bq('#loginRequired');
  return Boolean(app && !app.classList.contains('hidden'))
    || Boolean(loginRequired && !loginRequired.classList.contains('hidden'));
}

function hideBootstrapDependentPanels(app) {
  for (const child of app.children) {
    if (child.id === 'calendarOverview') continue;
    child.classList.add('reactus-bootstrap-dependent-hidden');
  }
}

function showDegradedCalendar() {
  if (startupResolved()) return;

  const app = bq('#app');
  if (!app) return;

  app.classList.remove('hidden');
  app.dataset.reactusDegradedStartup = '1';
  hideBootstrapDependentPanels(app);

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
      <p class="muted">画面全体を隠したままにはせず、月カレンダーだけ個別に読み込みます。予定作成などの設定が必要な操作は、再試行後に利用できます。</p>
      <div class="actions">
        <button id="reactusDegradedRetry" class="primary" type="button">再試行</button>
      </div>`;
    app.before(panel);
    bq('#reactusDegradedRetry')?.addEventListener('click', () => window.location.reload());
  }

  const eventList = bq('#eventList');
  if (eventList) eventList.innerHTML = '<p class="muted">月カレンダーを個別に読み込んでいます。</p>';
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

installStyles();
window.setTimeout(showDegradedCalendar, DEGRADED_STARTUP_MS);
