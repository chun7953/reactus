import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectSeoMetadata(page, canonicalUrl) {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index,follow/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Reactus/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonicalUrl);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://reactus.fly.dev/images/bot-icon.png');

  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(() => JSON.parse(jsonLd)).not.toThrow();
}

test('public homepage presents the current Reactus workflow and SEO metadata without horizontal overflow', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page).toHaveTitle(/Reactus \| Discord予約・定期投稿 × Google Calendar/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Discord運用を');
  await expect(page.getByText('日本語のWeb管理画面')).toBeVisible();
  await expect(page.getByRole('heading', { name: '予定を作るところから、Discordに届くところまで。' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '普段の設定は、コマンドではなく画面から。' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '導入済みなら、まず管理画面を開く。' })).toBeVisible();
  await expect(page.getByText('Discordで /reactus を実行')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('`/reactus`');

  const tryLink = page.getByRole('link', { name: 'Reactus開発室で試す' });
  await expect(tryLink).toHaveAttribute('href', 'https://discord.gg/m6mFzzEQhr');
  await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy.html');
  await expect(page.getByRole('link', { name: 'GitHubを見る' })).toHaveAttribute('href', 'https://github.com/chun7953/reactus');
  await expect(page.getByRole('link', { name: 'Discordの予約・定期投稿' })).toHaveAttribute('href', '/discord-scheduled-posts.html');
  await expect(page.getByRole('link', { name: 'Discord × Google Calendar' })).toHaveAttribute('href', '/discord-google-calendar.html');
  await expect(page.getByRole('link', { name: 'Discordの抽選・複数景品' })).toHaveAttribute('href', '/discord-giveaway-bot.html');

  await expectSeoMetadata(page, 'https://reactus.fly.dev/');
  await expectNoHorizontalOverflow(page);
});

test('search-intent pages are indexable, internally linked, and responsive', async ({ page }) => {
  const pages = [
    ['/discord-scheduled-posts.html', 'Discordの予約投稿・定期投稿を、予定表から自動化。', 'https://reactus.fly.dev/discord-scheduled-posts.html'],
    ['/discord-google-calendar.html', 'Google Calendarの予定を、Discord運用につなげる。', 'https://reactus.fly.dev/discord-google-calendar.html'],
    ['/discord-giveaway-bot.html', 'Discordの抽選を、複数景品までまとめて予約。', 'https://reactus.fly.dev/discord-giveaway-bot.html'],
  ];

  for (const [path, heading, canonicalUrl] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reactus トップ' })).toHaveAttribute('href', '/');
    await expectSeoMetadata(page, canonicalUrl);
    await expectNoHorizontalOverflow(page);
  }
});

test('crawler discovery files advertise only public content', async ({ request }) => {
  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBeTruthy();
  const robots = await robotsResponse.text();
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain('Sitemap: https://reactus.fly.dev/sitemap.xml');

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBeTruthy();
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain('<loc>https://reactus.fly.dev/</loc>');
  expect(sitemap).toContain('/discord-scheduled-posts.html</loc>');
  expect(sitemap).toContain('/discord-google-calendar.html</loc>');
  expect(sitemap).toContain('/discord-giveaway-bot.html</loc>');
  expect(sitemap).not.toContain('/admin');

  const llmsResponse = await request.get('/llms.txt');
  expect(llmsResponse.ok()).toBeTruthy();
  expect(await llmsResponse.text()).toContain('# Reactus');
});

test('privacy page shares the rebuilt public layout, canonical metadata, and remains readable', async ({ page }) => {
  await page.goto('/privacy.html');

  await expect(page).toHaveTitle('プライバシーポリシー | Reactus');
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '収集する情報' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reactus トップ' })).toHaveAttribute('href', '/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://reactus.fly.dev/privacy.html');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://reactus.fly.dev/privacy.html');

  await expectNoHorizontalOverflow(page);
});
