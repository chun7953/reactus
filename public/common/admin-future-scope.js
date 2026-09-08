function installFutureScope() {
  const select = document.querySelector('#editScope');
  if (!select) return false;

  const instance = [...select.options].find(option => option.value === 'instance');
  if (instance) instance.textContent = 'この予定のみ';

  let future = [...select.options].find(option => option.value === 'future');
  if (!future) {
    future = document.createElement('option');
    future.value = 'future';
    future.textContent = 'これ以降の予定';
    const series = [...select.options].find(option => option.value === 'series');
    select.insertBefore(future, series || null);
  }

  const series = [...select.options].find(option => option.value === 'series');
  if (series) series.textContent = 'すべての予定';
  return true;
}

function updateHint() {
  const select = document.querySelector('#editScope');
  const hint = document.querySelector('#editBannerHint');
  if (!select || !hint) return;
  if (select.value === 'future') {
    hint.textContent = '選んだ回より前はそのまま残し、この回以降を新しい定期予定として編集します。';
  }
}

const observer = new MutationObserver(() => {
  if (installFutureScope()) updateHint();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

installFutureScope();
document.addEventListener('change', event => {
  if (event.target?.id === 'editScope') window.setTimeout(updateHint, 0);
});
