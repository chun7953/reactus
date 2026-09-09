import './admin-polyfills.js';
import './common/admin-event-fetch-cache.js';
import './admin.js';

let enhancementsStarted = false;
let appObserver = null;

function appIsVisible() {
  const app = document.querySelector('#app');
  return Boolean(app && !app.classList.contains('hidden'));
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

  window.setTimeout(() => {
    const script = document.createElement('script');
    script.src = window.__reactusAdminEnhancementSrc || '/admin-enhancements.bundle.js';
    script.async = true;
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
