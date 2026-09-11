import './admin-polyfills.js';
import './admin.js';
import './common/admin-calendar-shell.js';
import './common/admin-calendar-month-view.js';
import './common/admin-mobile-day-inline.js';

let enhancementsStarted = false;
let appObserver = null;

function appIsVisible() {
  const app = document.querySelector('#app');
  return Boolean(app && !app.classList.contains('hidden'));
}

function clearExpiredLoginStateForActiveSession() {
  let expired = false;
  try {
    expired = new URLSearchParams(window.location.search).get('login') === 'expired';
  } catch {}
  if (!expired) return;

  const notice = document.querySelector('#notice');
  if (notice?.textContent?.includes('ログインリンクの有効期限が切れています')) {
    notice.classList.add('hidden');
  }

  try {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || ''}`);
  } catch {}
}

function showEnhancementFailure() {
  const notice = document.querySelector('#notice');
  if (!notice) return;
  notice.textContent = '補助機能の読み込みに失敗しました。基本操作は利用できます。ページを再読み込みしてください。';
  notice.classList.add('error');
  notice.classList.remove('hidden');
}

function startEnhancements() {
  if (enhancementsStarted || !appIsVisible()) return;
  enhancementsStarted = true;
  if (appObserver) {
    appObserver.disconnect();
    appObserver = null;
  }
  clearExpiredLoginStateForActiveSession();

  window.setTimeout(() => {
    const script = document.createElement('script');
    script.src = window.__reactusAdminEnhancementSrc || '/admin-enhancements.bundle.js';
    script.async = true;
    if (window.__reactusAdminEnhancementModule === true) script.type = 'module';
    script.onerror = showEnhancementFailure;
    document.body.appendChild(script);
  }, 0);
}

const app = document.querySelector('#app');
if (appIsVisible()) {
  startEnhancements();
} else if (app && window.MutationObserver) {
  appObserver = new MutationObserver(startEnhancements);
  appObserver.observe(app, { attributes: true, attributeFilter: ['class'] });
}
