const STARTUP_GRACE_MS = 10500;

let startupTimer = null;
let startupObserver = null;

function sq(selector) {
  return document.querySelector(selector);
}

function startupFinished() {
  const app = sq('#app');
  const loginRequired = sq('#loginRequired');
  return Boolean(app && !app.classList.contains('hidden'))
    || Boolean(loginRequired && !loginRequired.classList.contains('hidden'));
}

function removeStartupRetry() {
  sq('#reactusStartupRetry')?.remove();
  if (startupTimer) {
    window.clearTimeout(startupTimer);
    startupTimer = null;
  }
}

function showStartupRetry() {
  if (startupFinished() || sq('#reactusStartupRetry')) return;

  const identity = sq('#identity');
  if (identity) identity.textContent = '初期情報を読み込めませんでした';

  const panel = document.createElement('section');
  panel.id = 'reactusStartupRetry';
  panel.className = 'panel';
  panel.setAttribute('role', 'alert');
  panel.innerHTML = `
    <h2>読み込みに時間がかかっています</h2>
    <p class="muted">通信状態や、ReactusからDiscord・データベースへの一時的な接続遅延の可能性があります。待ち続ける必要はありません。</p>
    <div class="actions">
      <button id="reactusStartupRetryButton" class="primary" type="button">再試行</button>
    </div>`;

  const loginRequired = sq('#loginRequired');
  const app = sq('#app');
  (loginRequired || app)?.before(panel);
  sq('#reactusStartupRetryButton')?.addEventListener('click', () => {
    const button = sq('#reactusStartupRetryButton');
    if (button) {
      button.disabled = true;
      button.textContent = '再読み込み中…';
    }
    window.location.reload();
  });
}

function noticeLooksLikeStartupFailure() {
  const notice = sq('#notice');
  if (!notice || notice.classList.contains('hidden') || !notice.classList.contains('error')) return false;
  if (startupFinished()) return false;
  return true;
}

function observeStartup() {
  if (startupObserver) return;
  startupObserver = new MutationObserver(() => {
    if (startupFinished()) {
      removeStartupRetry();
      return;
    }
    if (noticeLooksLikeStartupFailure()) showStartupRetry();
  });
  startupObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  startupTimer = window.setTimeout(showStartupRetry, STARTUP_GRACE_MS);
  if (startupFinished()) removeStartupRetry();
}

function installStyles() {
  if (sq('#reactusStartupRetryStyles')) return;
  const style = document.createElement('style');
  style.id = 'reactusStartupRetryStyles';
  style.textContent = `
    #reactusStartupRetry{border-color:#6b5330;background:rgba(40,31,18,.94)}
    #reactusStartupRetry h2{margin-bottom:8px}
    #reactusStartupRetry .actions{justify-content:flex-start;margin-top:14px}
    @media(max-width:760px){#reactusStartupRetry .actions button{width:100%;min-width:0}}
  `;
  document.head.append(style);
}

installStyles();
observeStartup();
