let permissionBootstrap = null;
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

async function applyManageableTargets() {
  if (applying) return;
  applying = true;
  try {
    const bootstrap = await loadPermissionBootstrap();
    const manageableMonitors = new Set(
      (bootstrap.monitors || []).filter(monitor => monitor.canManage).map(monitor => String(monitor.id)),
    );
    const monitorSelect = document.querySelector('#monitor');
    removeUnavailableOptions(monitorSelect, manageableMonitors);
    ensureEmptyMonitorMessage(monitorSelect);
  } catch {
    // The main admin UI already surfaces authentication/bootstrap errors.
  } finally {
    applying = false;
  }
}

function install() {
  document.querySelectorAll('.segment').forEach(button => {
    button.addEventListener('click', () => void applyManageableTargets());
  });
  void applyManageableTargets();
}

install();
