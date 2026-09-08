const originalFetch = window.fetch.bind(window);
const EVENT_CACHE_TTL_MS = 2000;
const LEGACY_MONTH_DAYS = 45;
const LEGACY_MONTH_PAST_DAYS = 40;

const cachedRequests = new Map();
const inflightRequests = new Map();

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

async function cachedEventRequest(url) {
  const key = cacheKey(url);
  const cached = cachedRequests.get(key);
  if (cached && Date.now() - cached.loadedAt < EVENT_CACHE_TTL_MS) return cached;
  if (inflightRequests.has(key)) return inflightRequests.get(key);

  const inflight = (async () => {
    const response = await originalFetch(`${url.pathname}${url.search}`, {
      credentials: 'same-origin',
    });
    const text = await response.text();
    const result = {
      loadedAt: Date.now(),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
    };
    if (response.ok) cachedRequests.set(key, result);
    return result;
  })();

  inflightRequests.set(key, inflight);
  try {
    return await inflight;
  } finally {
    inflightRequests.delete(key);
  }
}

window.fetch = async function reactusAdminFetch(input, init = {}) {
  const url = requestUrl(input);
  const method = requestMethod(input, init);

  if (method === 'GET' && url?.origin === location.origin && url.pathname === '/api/admin/events') {
    const normalized = normalizedEventUrl(url);
    const result = await cachedEventRequest(normalized);
    return new Response(result.text, {
      status: result.status,
      statusText: result.statusText,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const response = await originalFetch(input, init);
  if (
    method !== 'GET'
    && url?.origin === location.origin
    && ['/api/admin/schedules', '/api/admin/update', '/api/admin/delete', '/api/admin/move', '/api/admin/duplicate'].includes(url.pathname)
    && response.ok
  ) {
    invalidateEvents();
  }
  return response;
};

window.addEventListener('pageshow', event => {
  if (event.persisted) invalidateEvents();
});
