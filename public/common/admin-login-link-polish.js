function loginLinkWasExpired() {
  try {
    return new URLSearchParams(window.location.search).get('login') === 'expired';
  } catch {
    return false;
  }
}

function clearExpiredLoginWarningForActiveSession() {
  if (!loginLinkWasExpired()) return;
  const app = document.querySelector('#app');
  if (!app || app.classList.contains('hidden')) return;

  const notice = document.querySelector('#notice');
  if (notice?.textContent?.includes('ログインリンクの有効期限が切れています')) {
    notice.classList.add('hidden');
  }

  try {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || ''}`);
  } catch {}
}

clearExpiredLoginWarningForActiveSession();
