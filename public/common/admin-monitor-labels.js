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
    if (visible && option.textContent !== visible) option.textContent = visible;
  }
  return true;
}

cleanMonitorLabels();
