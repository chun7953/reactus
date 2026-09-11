import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

test('official reference is indexable, structured, and responsive', async ({ page }) => {
  await page.goto('/reference.html');

  await expect(page).toHaveTitle(/Reactus 公式リファレンス/);
  await expect(page.getByRole('heading', { level: 1, name: 'Reactus 公式リファレンス' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Reactusとは' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '現在の主な対応機能' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'よくある質問' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '公式情報源' })).toBeVisible();

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index,follow/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://reactus.fly.dev/reference.html');
  await expect(page.locator('link[rel="alternate"][type="text/plain"]')).toHaveAttribute('href', 'https://reactus.fly.dev/llms-full.txt');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://reactus.fly.dev/reference.html');

  const structuredData = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  const types = structuredData['@graph'].map((entry) => entry['@type']);
  expect(types).toContain('WebPage');
  expect(types).toContain('SoftwareApplication');
  expect(types).toContain('FAQPage');

  await expectNoHorizontalOverflow(page);
});

test('machine-readable references and sitemap expose the canonical source', async ({ request }) => {
  const compactResponse = await request.get('/llms.txt');
  expect(compactResponse.ok()).toBeTruthy();
  const compact = await compactResponse.text();
  expect(compact).toContain('Official reference: https://reactus.fly.dev/reference.html');
  expect(compact).toContain('Full machine-readable reference: https://reactus.fly.dev/llms-full.txt');

  const fullResponse = await request.get('/llms-full.txt');
  expect(fullResponse.ok()).toBeTruthy();
  const full = await fullResponse.text();
  expect(full).toContain('# Reactus official machine-readable reference');
  expect(full).toContain('Canonical human-readable reference: https://reactus.fly.dev/reference.html');
  expect(full).toContain('## Source authority');

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBeTruthy();
  expect(await sitemapResponse.text()).toContain('<loc>https://reactus.fly.dev/reference.html</loc>');
});
