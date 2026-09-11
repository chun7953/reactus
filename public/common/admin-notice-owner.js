import { ADMIN_NOTICE_EVENT } from './admin-notice.js';

let hideTimer = null;
let noticeVersion = 0;

function noticeNode() {
  return document.querySelector('#notice');
}

function cancelHideTimer() {
  if (hideTimer === null) return;
  window.clearTimeout(hideTimer);
  hideTimer = null;
}

function renderAdminNotice({ message = '', error = false, duration = 7000 } = {}) {
  const notice = noticeNode();
  if (!notice) return;

  cancelHideTimer();
  noticeVersion += 1;
  const version = noticeVersion;

  notice.textContent = String(message);
  notice.classList.toggle('error', Boolean(error));
  notice.classList.remove('hidden');

  const requestedDuration = Number(duration);
  if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) return;

  hideTimer = window.setTimeout(() => {
    if (version !== noticeVersion) return;
    notice.classList.add('hidden');
    hideTimer = null;
  }, requestedDuration);
}

export function dismissAdminNotice({ messageIncludes = '' } = {}) {
  const notice = noticeNode();
  if (!notice) return false;
  if (messageIncludes && !notice.textContent?.includes(messageIncludes)) return false;

  cancelHideTimer();
  noticeVersion += 1;
  notice.classList.add('hidden');
  return true;
}

document.addEventListener(ADMIN_NOTICE_EVENT, event => {
  renderAdminNotice(event.detail || {});
});
