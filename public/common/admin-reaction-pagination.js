const REACTION_PAGE_SIZE = 8;
let reactionPage = 0;

function ensureReactionControls() {
  const list = document.querySelector('#reactionRules');
  if (!list) return null;

  let wrapper = document.querySelector('#reactionRuleControls');
  if (wrapper) return wrapper;

  wrapper = document.createElement('div');
  wrapper.id = 'reactionRuleControls';
  wrapper.style.display = 'grid';
  wrapper.style.gap = '8px';
  wrapper.style.marginTop = '10px';

  const search = document.createElement('input');
  search.id = 'reactionRuleSearch';
  search.type = 'search';
  search.placeholder = 'チャンネル名・トリガー・絵文字で検索';
  search.autocomplete = 'off';

  const nav = document.createElement('div');
  nav.className = 'tools-row';

  const prev = document.createElement('button');
  prev.id = 'reactionRulePrev';
  prev.type = 'button';
  prev.className = 'small';
  prev.textContent = '← 前へ';

  const status = document.createElement('span');
  status.id = 'reactionRuleStatus';
  status.className = 'muted';

  const next = document.createElement('button');
  next.id = 'reactionRuleNext';
  next.type = 'button';
  next.className = 'small';
  next.textContent = '次へ →';

  prev.addEventListener('click', () => {
    reactionPage = Math.max(0, reactionPage - 1);
    applyReactionPage();
  });
  next.addEventListener('click', () => {
    reactionPage += 1;
    applyReactionPage();
  });
  search.addEventListener('input', () => {
    reactionPage = 0;
    applyReactionPage();
  });

  nav.append(prev, status, next);
  wrapper.append(search, nav);
  list.after(wrapper);
  return wrapper;
}

function applyReactionPage() {
  const list = document.querySelector('#reactionRules');
  const controls = ensureReactionControls();
  if (!list || !controls) return;

  const rows = [...list.querySelectorAll(':scope > .reaction-rule')];
  if (!rows.length) {
    controls.hidden = true;
    return;
  }
  controls.hidden = false;

  const query = String(document.querySelector('#reactionRuleSearch')?.value || '')
    .trim()
    .toLocaleLowerCase('ja');
  const matched = rows.filter(row => !query || row.textContent.toLocaleLowerCase('ja').includes(query));
  const totalPages = Math.max(1, Math.ceil(matched.length / REACTION_PAGE_SIZE));
  reactionPage = Math.min(reactionPage, totalPages - 1);

  const matchedSet = new Set(matched);
  const start = reactionPage * REACTION_PAGE_SIZE;
  const visibleSet = new Set(matched.slice(start, start + REACTION_PAGE_SIZE));
  for (const row of rows) {
    row.style.display = matchedSet.has(row) && visibleSet.has(row) ? '' : 'none';
  }

  const prev = document.querySelector('#reactionRulePrev');
  const next = document.querySelector('#reactionRuleNext');
  const status = document.querySelector('#reactionRuleStatus');
  if (prev) prev.disabled = reactionPage <= 0;
  if (next) next.disabled = reactionPage >= totalPages - 1;
  if (status) {
    status.textContent = query
      ? `${matched.length}件一致 · ${reactionPage + 1} / ${totalPages}ページ`
      : `${rows.length}件 · ${reactionPage + 1} / ${totalPages}ページ`;
  }
}

function install() {
  ensureReactionControls();
  document.addEventListener('reactus:reaction-rules-rendered', () => {
    reactionPage = 0;
    queueMicrotask(applyReactionPage);
  });
  applyReactionPage();
}

install();
