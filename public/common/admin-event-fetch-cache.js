const originalFetch = window.fetch.bind(window);
const EVENT_CACHE_TTL_MS = 2000;
const CANONICAL_DAYS = 365;
const CANONICAL_PAST_DAYS = 45;

let cached = null;
let inflight = null;

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

function eventBounds(event) {
  const start = new Date(event?.start || 0).getTime();
  const end = new Date(event?.end || event?.start || 0).getTime();
  return {
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : start,
  };
}

function filterEvents(events, url) {
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') || 90) || 90));
  const pastDays = Math.max(0, Math.min(365, Number(url.searchParams.get('pastDays') || 0) || 0));
  const now = Date.now();
  const min = now - pastDays * 24 * 60 * 60 * 1000;
  const max = now + days * 24 * 60 * 60 * 1000;
  return events.filter(event => {
    const bounds = eventBounds(event);
    return bounds.start < max && Math.max(bounds.end, bounds.start) >= min;
  });
}

function invalidateEvents() {
  cached = null;
  inflight = null;
}

async function canonicalEvents() {
  if (cached && Date.now() - cached.loadedAt < EVENT_CACHE_TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await originalFetch(
      `/api/admin/events?days=${CANONICAL_DAYS}&pastDays=${CANONICAL_PAST_DAYS}`,
      { credentials: 'same-origin' },
    );
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    const result = {
      loadedAt: Date.now(),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
    };
    if (response.ok) cached = result;
    return result;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

window.fetch = async function reactusAdminFetch(input, init = {}) {
  const url = requestUrl(input);
  const method = requestMethod(input, init);

  if (method === 'GET' && url?.origin === location.origin && url.pathname === '/api/admin/events') {
    const result = await canonicalEvents();
    const body = result.ok
      ? { ...result.data, events: filterEvents(result.data?.events || [], url) }
      : result.data;
    return new Response(JSON.stringify(body), {
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
