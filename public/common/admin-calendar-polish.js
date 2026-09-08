const state = {
  events: [],
  bootstrap: null,
  refreshTimer: null,
};

function api(path) {
  return fetch(path, { credentials: 'same-origin' }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  });
}

function cleanMonitorOptionText() {
  const select = document.querySelector('#monitor');
  if (!select) return;
  for (const option of select.options) {
    const text = option.textContent || '';
    if (text.includes(' — ')) option.textContent = text.split(' — ')[0];
    if (text === 'ラキショ用の設定がありません') option.textContent = '抽選用の投稿先がありません';
  }
}

function channelName(id) {
  const monitor = state.bootstrap?.monitors?.find(item => String(item.channelId) === String(id));
  if (monitor?.channelName) return `#${monitor.channelName}`;
  const channel = state.bootstrap?.channels?.find(item => String(item.id) === String(id));
  return channel?.name ? `#${channel.name}` : `#${id}`;
}

function formatDateTime(value) {
  if (!value) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function parseGiveawayLines(description) {
  const prizes = [];
  const message = [];
  for (const raw of String(description || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^【(.+)\/(\d+)】$/);
    if (match) prizes.push(`${match[1]} × ${match[2]}名`);
    else message.push(line);
  }
  return { prizes, message: message.join('\n') };
}

function ensureTooltip() {
  let tooltip = document.querySelector('#calendarHoverDetail');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'calendarHoverDetail';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  const style = document.createElement('style');
  style.textContent = `
    #calendarHoverDetail{position:fixed;z-index:10000;max-width:min(390px,calc(100vw - 24px));padding:11px 12px;border:1px solid #354253;border-radius:10px;background:#0e151d;color:#eef3f8;box-shadow:0 12px 36px rgba(0,0,0,.38);font-size:13px;line-height:1.45;white-space:normal;pointer-events:none}
    #calendarHoverDetail[hidden]{display:none}
    #calendarHoverDetail .hover-title{font-weight:700;font-size:14px;margin-bottom:5px}
    #calendarHoverDetail .hover-meta{color:#aab5c2;font-size:12px;margin-bottom:7px}
    #calendarHoverDetail .hover-body{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:hidden}
    #calendarHoverDetail .hover-prize{margin-top:2px}
  `;
  document.head.append(style);
  return tooltip;
}

function eventForNode(node) {
  const href = node.href || node.getAttribute('href');
  if (href) {
    const match = state.events.find(event => event.htmlLink && String(event.htmlLink) === String(href));
    if (match) return match;
  }
  const title = node.dataset.reactusOriginalTitle || node.getAttribute('title') || '';
  const matches = state.events.filter(event => String(event.summary || '') === title);
  return matches.length === 1 ? matches[0] : null;
}

function fillTooltip(event) {
  const tooltip = ensureTooltip();
  tooltip.replaceChildren();

  const title = document.createElement('div');
  title.className = 'hover-title';
  title.textContent = event.summary || 'タイトルなし';

  const meta = document.createElement('div');
  meta.className = 'hover-meta';
  const parts = [
    event.type === 'giveaway' ? '抽選' : '通常投稿',
    channelName(event.channelId),
    `${formatDateTime(event.start)} → ${formatDateTime(event.end)}`,
  ];
  if (event.recurringEventId) parts.push('繰り返し');
  if (event.hasImage) parts.push('画像あり');
  meta.textContent = parts.join(' · ');
  tooltip.append(title, meta);

  const body = document.createElement('div');
  body.className = 'hover-body';
  if (event.type === 'giveaway') {
    const parsed = parseGiveawayLines(event.description);
    for (const prize of parsed.prizes) {
      const line = document.createElement('div');
      line.className = 'hover-prize';
      line.textContent = `🎁 ${prize}`;
      body.append(line);
    }
    if (parsed.message) {
      const message = document.createElement('div');
      message.style.marginTop = parsed.prizes.length ? '7px' : '0';
      message.textContent = parsed.message;
      body.append(message);
    }
  } else {
    body.textContent = event.description || '本文なし';
  }
  tooltip.append(body);
  return tooltip;
}

function positionTooltip(tooltip, node) {
  const rect = node.getBoundingClientRect();
  tooltip.hidden = false;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = rect.right + 8;
  let top = rect.top;
  if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 8);
  if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  const tooltip = document.querySelector('#calendarHoverDetail');
  if (tooltip) tooltip.hidden = true;
}

function wireMonthEvents() {
  document.querySelectorAll('.month-event').forEach(node => {
    if (node.dataset.reactusHoverReady === '1') return;
    node.dataset.reactusHoverReady = '1';
    const nativeTitle = node.getAttribute('title');
    if (nativeTitle) node.dataset.reactusOriginalTitle = nativeTitle;
    node.removeAttribute('title');

    const show = () => {
      const event = eventForNode(node);
      if (!event) return;
      positionTooltip(fillTooltip(event), node);
    };
    node.addEventListener('mouseenter', show);
    node.addEventListener('focus', show);
    node.addEventListener('mouseleave', hideTooltip);
    node.addEventListener('blur', hideTooltip);
  });
}

async function refreshData() {
  try {
    const [eventsResult, bootstrap] = await Promise.all([
      api('/api/admin/events?days=365'),
      state.bootstrap ? Promise.resolve(state.bootstrap) : api('/api/admin/bootstrap'),
    ]);
    state.events = eventsResult.events || [];
    state.bootstrap = bootstrap;
    cleanMonitorOptionText();
    wireMonthEvents();
  } catch {
    // The base admin UI owns user-facing error handling. Hover details are optional.
  }
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(refreshData, 120);
}

const observer = new MutationObserver(() => {
  cleanMonitorOptionText();
  wireMonthEvents();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('resize', hideTooltip);
window.addEventListener('scroll', hideTooltip, true);
document.querySelector('#refreshEvents')?.addEventListener('click', scheduleRefresh);
document.querySelector('#scheduleForm')?.addEventListener('submit', () => window.setTimeout(scheduleRefresh, 900));

cleanMonitorOptionText();
refreshData();
