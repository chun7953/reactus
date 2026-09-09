let permissionBootstrap = null;
let permissionObserver = null;
let applying = false;

async function loadPermissionBootstrap() {
  if (permissionBootstrap) return permissionBootstrap;
  const response = await fetch('/api/admin/bootstrap', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  permissionBootstrap = data;
  return data;
}

function removeUnavailableOptions(select, allowedIds) {
  if (!select) return;
  for (const option of [...select.options]) {
    if (!option.value) continue;
    if (!allowedIds.has(String(option.value))) option.remove();
  }
}

function ensureEmptyMonitorMessage(select) {
  if (!select || [...select.options].some(option => option.value)) return;
  if ([...select.options].some(option => !option.value)) return;
  const option = document.createElement('option');
  option.value = '';
  option.textContent = document.querySelector('#scheduleType')?.value === 'giveaway'
    ? '抽選用の投稿先がありません'
    : '通常投稿用の投稿先がありません';
  select.append(option);
}

function markReadOnlyRows(bootstrap) {
  const channelManage = new Map((bootstrap.channels || []).map(channel => [String(channel.id), Boolean(channel.canManage)]));

  const reactionRows = [...document.querySelectorAll('#reactionRules > .reaction-rule')];
  reactionRows.forEach((row, index) => {
    const rule = bootstrap.reactionRules?.[index];
    if (!rule) return;
    const canManage = channelManage.get(String(rule.channelId)) === true;
    row.querySelectorAll('.reaction-actions button').forEach(button => {
      button.hidden = !canManage;
    });
    let badge = row.querySelector('.reactus-readonly-badge');
    if (!canManage && !badge) {
      badge = document.createElement('div');
      badge.className = 'muted reactus-readonly-badge';
      badge.textContent = '閲覧のみ';
      row.querySelector(':scope > div')?.append(badge);
    }
    if (canManage && badge) badge.remove();
  });

  const calendarCards = [...document.querySelectorAll('#calendarSettingList > .calendar-setting-card')];
  calendarCards.forEach((card, index) => {
    const monitor = bootstrap.monitors?.[index];
    if (!monitor) return;
    const canManage = monitor.canManage === true;
    card.querySelectorAll('.event-actions button').forEach(button => {
      button.hidden = !canManage;
    });
    let badge = card.querySelector('.reactus-readonly-badge');
    if (!canManage && !badge) {
      badge = document.createElement('div');
      badge.className = 'muted reactus-readonly-badge';
      badge.textContent = '閲覧のみ';
      card.querySelector(':scope > div')?.append(badge);
    }
    if (canManage && badge) badge.remove();
  });
}

async function applyManageableTargets() {
  if (applying) return;
  applying = true;
  try {
    const bootstrap = await loadPermissionBootstrap();
    const manageableChannels = new Set(
      (bootstrap.channels || []).filter(channel => channel.canManage).map(channel => String(channel.id)),
    );
    const manageableMonitors = new Set(
      (bootstrap.monitors || []).filter(monitor => monitor.canManage).map(monitor => String(monitor.id)),
    );

    removeUnavailableOptions(document.querySelector('#reactionChannel'), manageableChannels);
    removeUnavailableOptions(document.querySelector('#calendarSettingChannel'), manageableChannels);
    const monitorSelect = document.querySelector('#monitor');
    removeUnavailableOptions(monitorSelect, manageableMonitors);
    ensureEmptyMonitorMessage(monitorSelect);
    markReadOnlyRows(bootstrap);
  } catch {
    // The main admin UI already surfaces authentication/bootstrap errors.
  } finally {
    applying = false;
  }
}

function install() {
  if (permissionObserver) return;
  permissionObserver = new MutationObserver(() => queueMicrotask(applyManageableTargets));
  permissionObserver.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('.segment').forEach(button => {
    button.addEventListener('click', () => queueMicrotask(applyManageableTargets));
  });
  void applyManageableTargets();
}

install();
