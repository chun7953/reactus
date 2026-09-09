const DESTINATION_TTL_MS = 15_000;

const destinationState = {
  monitors: null,
  loadedAt: 0,
  loading: null,
  preferredMonitorId: null,
};

function currentScheduleType() {
  return document.querySelector('#scheduleType')?.value || 'post';
}

function destinationMatchesType(monitor, type) {
  if (monitor.canManage === false) return false;
  return type === 'giveaway'
    ? monitor.triggerKeyword === 'ラキショ'
    : monitor.triggerKeyword !== 'ラキショ';
}

function destinationLabel(monitor, duplicateChannelIds) {
  const base = `#${monitor.channelName}`;
  if (!duplicateChannelIds.has(String(monitor.channelId))) return base;
  const calendar = String(monitor.calendarName || monitor.calendarId || '').trim();
  return calendar ? `${base} (${calendar})` : `${base} (設定${monitor.id})`;
}

function renderDestinations(preferredMonitorId = null) {
  const select = document.querySelector('#monitor');
  if (!select || !destinationState.monitors) return;

  const type = currentScheduleType();
  const previous = String(preferredMonitorId || destinationState.preferredMonitorId || select.value || '');
  const monitors = destinationState.monitors.filter(monitor => destinationMatchesType(monitor, type));
  const channelCounts = new Map();
  for (const monitor of monitors) {
    const key = String(monitor.channelId);
    channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
  }
  const duplicateChannelIds = new Set(
    [...channelCounts].filter(([, count]) => count > 1).map(([channelId]) => channelId),
  );

  select.replaceChildren();
  for (const monitor of monitors) {
    const option = document.createElement('option');
    option.value = String(monitor.id);
    option.textContent = destinationLabel(monitor, duplicateChannelIds);
    select.append(option);
  }

  const matching = [...select.options].find(option => option.value === previous);
  if (matching) select.value = matching.value;

  if (monitors.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = type === 'giveaway'
      ? '抽選用の投稿先がありません'
      : '通常投稿用の投稿先がありません';
    select.append(option);
  }
}

async function fetchBootstrap(mode) {
  const response = await fetch(`/api/admin/bootstrap?channels=${encodeURIComponent(mode)}`, {
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function refreshDestinations({ force = false, preferredMonitorId = null, silent = false } = {}) {
  if (preferredMonitorId) destinationState.preferredMonitorId = String(preferredMonitorId);

  const fresh = destinationState.monitors
    && (Date.now() - destinationState.loadedAt) < DESTINATION_TTL_MS;
  if (!force && fresh) {
    renderDestinations(preferredMonitorId);
    return destinationState.monitors;
  }

  if (destinationState.loading) {
    try {
      await destinationState.loading;
      renderDestinations(preferredMonitorId);
      return destinationState.monitors;
    } catch {
      return destinationState.monitors;
    }
  }

  const mode = force ? 'refresh' : '1';
  destinationState.loading = fetchBootstrap(mode)
    .then(result => {
      destinationState.monitors = Array.isArray(result.monitors) ? result.monitors : [];
      destinationState.loadedAt = Date.now();
      renderDestinations(preferredMonitorId);
      return destinationState.monitors;
    })
    .catch(error => {
      if (silent) return destinationState.monitors;
      const notice = document.querySelector('#notice');
      if (notice) {
        notice.textContent = `投稿先を更新できませんでした。${error.message ? ` ${error.message}` : ''}`;
        notice.classList.add('error');
        notice.classList.remove('hidden');
      }
      throw error;
    })
    .finally(() => {
      destinationState.loading = null;
    });

  return destinationState.loading;
}

function refreshAfterInitialRender() {
  const app = document.querySelector('#app');
  if (!app) return;

  const start = () => {
    if (app.classList.contains('hidden')) return false;
    void refreshDestinations({ silent: true });
    return true;
  };

  if (start()) return;
  const observer = new MutationObserver(() => {
    if (!start()) return;
    observer.disconnect();
  });
  observer.observe(app, { attributes: true, attributeFilter: ['class'] });
}

const select = document.querySelector('#monitor');
if (select) {
  select.addEventListener('focus', () => {
    void refreshDestinations({ force: true, preferredMonitorId: select.value, silent: true });
  });
  select.addEventListener('change', () => {
    destinationState.preferredMonitorId = select.value || null;
  });
}

document.querySelectorAll('.segment').forEach(button => {
  button.addEventListener('click', () => {
    destinationState.preferredMonitorId = null;
    window.setTimeout(() => {
      void refreshDestinations({ force: true, silent: true });
    }, 0);
  });
});

document.addEventListener('reactus:edit-event', event => {
  const monitorId = event.detail?.monitorId;
  if (!monitorId) return;
  destinationState.preferredMonitorId = String(monitorId);
  void refreshDestinations({ force: true, preferredMonitorId: monitorId, silent: true });
});

refreshAfterInitialRender();
