const DESTINATION_TTL_MS = 15_000;

const destinationState = {
  monitors: null,
  loadedAt: 0,
  loading: null,
  rendering: false,
  suppressObserver: false,
  preferredMonitorId: null,
};

function currentScheduleType() {
  return document.querySelector('#scheduleType')?.value || 'post';
}

function destinationMatchesType(monitor, type) {
  return type === 'giveaway'
    ? monitor.triggerKeyword === 'ラキショ'
    : monitor.triggerKeyword !== 'ラキショ';
}

function renderDestinations(preferredMonitorId = null) {
  const select = document.querySelector('#monitor');
  if (!select || !destinationState.monitors) return;

  const type = currentScheduleType();
  const previous = String(preferredMonitorId || destinationState.preferredMonitorId || select.value || '');
  const monitors = destinationState.monitors.filter(monitor => destinationMatchesType(monitor, type));

  destinationState.rendering = true;
  destinationState.suppressObserver = true;
  try {
    select.replaceChildren();
    for (const monitor of monitors) {
      const option = document.createElement('option');
      option.value = String(monitor.id);
      option.textContent = `#${monitor.channelName} — ${monitor.triggerKeyword}`;
      select.append(option);
    }

    const matching = [...select.options].find(option => option.value === previous);
    if (matching) select.value = matching.value;

    if (monitors.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = type === 'giveaway'
        ? 'ラキショ用の設定がありません'
        : '通常投稿用の設定がありません';
      select.append(option);
    }
  } finally {
    destinationState.rendering = false;
    queueMicrotask(() => {
      destinationState.suppressObserver = false;
    });
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
      if (!silent) {
        const notice = document.querySelector('#notice');
        if (notice) {
          notice.textContent = `投稿先を更新できませんでした。${error.message ? ` ${error.message}` : ''}`;
          notice.classList.add('error');
          notice.classList.remove('hidden');
        }
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
    void refreshDestinations({ force: true, preferredMonitorId: select.value, silent: true });
  });

  const observer = new MutationObserver(() => {
    if (destinationState.suppressObserver || !destinationState.monitors) return;
    queueMicrotask(() => {
      if (!destinationState.rendering) renderDestinations();
    });
  });
  observer.observe(select, { childList: true });
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