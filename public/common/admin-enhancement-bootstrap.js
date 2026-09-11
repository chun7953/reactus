let bootstrap = null;
let loading = null;

async function fetchBootstrap() {
  const response = await fetch('/api/admin/bootstrap', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export async function loadEnhancementBootstrap({ force = false } = {}) {
  if (!force && bootstrap) return bootstrap;
  if (loading) {
    await loading;
    if (!force && bootstrap) return bootstrap;
  }

  const request = fetchBootstrap();
  loading = request;
  try {
    bootstrap = await request;
    return bootstrap;
  } finally {
    if (loading === request) loading = null;
  }
}

export function currentEnhancementBootstrap() {
  return bootstrap;
}
