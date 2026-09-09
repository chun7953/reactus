const originalFetch = window.fetch.bind(window);
const EVENT_CACHE_TTL_MS = 2000;
const BOOTSTRAP_CACHE_TTL_MS = 5000;
const BOOTSTRAP_GET_TIMEOUT_MS = 12000;
const EVENT_GET_TIMEOUT_MS = 35000;
const LEGACY_MONTH_DAYS = 45;
const LEGACY_MONTH_PAST_DAYS = 40;
const EXPLICIT_REFRESH_WINDOW_MS = 2000;

const cachedRequests = new Map();
const inflightRequests = new Map();
let cachedBootstrap = null;
let inflightBootstrap = null;
let forceEventRefreshUntil = 0;

function requestUrl(input) {
  try {
    if (input instanceof Request) return new URL(input.url, location.href);
    return new URL(String(input), location.href);
  } catch {
    return null;
  }
}

function requestMethod(input, init) {
  return String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
}

function normalizedEventUrl(url) {
  const normalized = new URL(url.href);
  const days = Number(normalized.searchParams.get('days') || 90);

  // Older month-calendar helpers asked for a full year only so they could render
  // whichever dates were visible. Keep those callers working, but do not make
  // the user wait for a year-wide Google Calendar scan on every page load.
  if (days >= 365 && !normalized.searchParams.has('pastDays')) {
    normalized.searchParams.set('days', String(LEGACY_MONTH_DAYS));
    normalized.searchParams.set('pastDays', String(LEGACY_MONTH_PAST_DAYS));
  }
  return normalized;
}

function cacheKey(url) {
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function invalidateEvents() {
  cachedRequests.clear();
  inflightRequests.clear();
}

function invalidateBootstrap() {
  cachedBootstrap = null;
  inflightBootstrap = null;
}

function beginExplicitCalendarRefresh() {
  forceEventRefreshUntil = Date.now() + EXPLICIT_REFRESH_WINDOW_MS;
  cachedRequests.clear();
}

function shouldForceCalendarRefresh(url) {
  return url.searchParams.get('refresh') === '1' || Date.now() < forceEventRefreshUntil;
}

async function fetchText(url, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await originalFetch(`${url.pathname}${url.search}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      loadedAt: Date.now(),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function responseFromResult(result) {
  return new Response(result.text, {
    status: result.status,
    statusText: result.statusText,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function cachedEventRequest(url, { forceRefresh = false } = {}) {
  const key = cacheKey(url);
  const cached = cachedRequests.get(key);
  if (!forceRefresh && cached && Date.now() - cached.loadedAt < EVENT_CACHE_TTL_MS) return cached;
  if (inflightRequests.has(key)) return inflightRequests.get(key);

  const inflight = fetchText(
    url,
    EVENT_GET_TIMEOUT_MS,
    'カレンダーの読み込みに時間がかかっています。更新して再試行してください。',
  ).then(result => {
    if (result.ok) cachedRequests.set(key, result);
    return result;
  });

  inflightRequests.set(key, inflight);
  try {
    return await inflight;
  } finally {
    inflightRequests.delete(key);
  }
}

async function cachedBootstrapRequest(url) {
  if (cachedBootstrap && Date.now() - cachedBootstrap.loadedAt < BOOTSTRAP_CACHE_TTL_MS) {
    return cachedBootstrap;
  }
  if (inflightBootstrap) return inflightBootstrap;

  inflightBootstrap = fetchText(
    url,
    BOOTSTRAP_GET_TIMEOUT_MS,
    '読み込みに時間がかかっています。再試行してください。',
  ).then(result => {
    if (result.ok) cachedBootstrap = result;
    return result;
  });
  try {
    return await inflightBootstrap;
  } finally {
    inflightBootstrap = null;
  }
}

window.fetch = async function reactusAdminFetch(input, init = {}) {
  const url = requestUrl(input);
  const method = requestMethod(input, init);

  if (method === 'GET' && url?.origin === location.origin && url.pathname === '/api/admin/bootstrap') {
    return responseFromResult(await cachedBootstrapRequest(url));
  }

  if (method === 'GET' && url?.origin === location.origin && url.pathname === '/api/admin/events') {
    const normalized = normalizedEventUrl(url);
    const forceRefresh = shouldForceCalendarRefresh(normalized);
    if (forceRefresh) normalized.searchParams.set('refresh', '1');
    return responseFromResult(await cachedEventRequest(normalized, { forceRefresh }));
  }

  const response = await originalFetch(input, init);
  if (method !== 'GET' && url?.origin === location.origin && url.pathname.startsWith('/api/admin/')) {
    if (response.ok) invalidateBootstrap();
    if (
      response.ok
      && ['/api/admin/schedules', '/api/admin/update', '/api/admin/delete', '/api/admin/move', '/api/admin/duplicate'].includes(url.pathname)
    ) {
      invalidateEvents();
    }
  }
  return response;
};

document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('#refreshEvents')) {
    beginExplicitCalendarRefresh();
  }
}, true);

window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  invalidateEvents();
  invalidateBootstrap();
});
