function cleanMonitorLabels() {
  const select = document.querySelector('#monitor');
  if (!select) return false;

  for (const option of select.options) {
    if (!option.value) {
      if (option.textContent.includes('ラキショ')) option.textContent = '抽選用の投稿先がありません';
      if (option.textContent.includes('通常投稿用')) option.textContent = '通常投稿用の投稿先がありません';
      continue;
    }
    const visible = String(option.textContent || '').split(' — ')[0].trim();
    if (visible) option.textContent = visible;
  }
  return true;
}

function install() {
  const select = document.querySelector('#monitor');
  if (!select) return false;
  cleanMonitorLabels();
  const observer = new MutationObserver(() => queueMicrotask(cleanMonitorLabels));
  observer.observe(select, { childList: true, subtree: true, characterData: true });
  document.querySelector('#scheduleType')?.addEventListener('change', () => queueMicrotask(cleanMonitorLabels));
  document.querySelectorAll('.segment').forEach(button => {
    button.addEventListener('click', () => queueMicrotask(cleanMonitorLabels));
  });
  return true;
}

if (!install()) {
  const observer = new MutationObserver(() => {
    if (install()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
