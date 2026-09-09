import './admin-calendar-settings.js';
import './admin-calendar-settings-fold.js';
import './admin-mentions.js';
import './admin-preview.js';
import './admin-calendar-edit.js';
import './admin-calendar-quick-create.js';
import './admin-calendar-drag.js';
import './admin-announcements.js';
import './admin-announcement-readability.js';
import './admin-announcement-safety.js';
import './admin-japanese-ui.js';
import './admin-dashboard-usability.js';
import './admin-monitor-labels.js';
import './admin-reaction-pagination.js';
import './admin-calendar-settings-usability.js';
import './admin-manageable-targets.js';
import './admin-navigation-polish.js';
import './admin-mobile.js';
import './admin-mobile-layout-hotfix.js';
import './admin-mobile-day-inline.js';
import './admin-login-link-polish.js';
import './admin-panel-layout.js';
import './admin-edit-feedback.js';

function setTextIfChanged(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function installFutureScope() {
  const select = document.querySelector('#editScope');
  if (!select) return false;

  const instance = [...select.options].find(option => option.value === 'instance');
  setTextIfChanged(instance, 'この予定のみ');

  let future = [...select.options].find(option => option.value === 'future');
  if (!future) {
    future = document.createElement('option');
    future.value = 'future';
    future.textContent = 'これ以降の予定';
    const series = [...select.options].find(option => option.value === 'series');
    select.insertBefore(future, series || null);
  }

  const series = [...select.options].find(option => option.value === 'series');
  setTextIfChanged(series, 'すべての予定');
  return true;
}

function updateHint() {
  const select = document.querySelector('#editScope');
  const hint = document.querySelector('#editBannerHint');
  if (!select || !hint || select.value !== 'future') return;
  setTextIfChanged(hint, '選んだ回より前はそのまま残し、この回以降を新しい定期予定として編集します。');
}

const observer = new MutationObserver(() => {
  if (installFutureScope()) updateHint();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

installFutureScope();
document.addEventListener('change', event => {
  if (event.target?.id === 'editScope') window.setTimeout(updateHint, 0);
});
