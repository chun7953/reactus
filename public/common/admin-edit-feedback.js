function editorPanel() {
  return document.querySelector('#schedulePanel')
    || document.querySelector('#scheduleForm')?.closest('.panel')
    || null;
}

function beginEditFeedback(label = '') {
  const panel = editorPanel();
  const banner = document.querySelector('#editBanner');
  const title = document.querySelector('#editBannerTitle');
  const hint = document.querySelector('#editBannerHint');

  banner?.classList.remove('hidden');
  if (title) title.textContent = label ? `「${label}」を編集中` : '予定を編集中';
  if (hint) hint.textContent = '予定の内容を読み込んでいます…';

  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function upcomingEditButton(target) {
  if (!(target instanceof Element)) return null;
  const button = target.closest('#eventList .event-actions button');
  if (!button || button.textContent?.trim() !== '編集') return null;
  return button;
}

document.addEventListener('click', event => {
  const button = upcomingEditButton(event.target);
  if (!button) return;
  const card = button.closest('.event-card');
  const label = card?.querySelector('.event-title')?.textContent?.trim() || '';
  beginEditFeedback(label);
});

document.addEventListener('reactus:edit-event', event => {
  const label = event.detail?.summary || event.detail?.title || '';
  beginEditFeedback(label);
});
