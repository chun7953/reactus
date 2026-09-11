import { expect, test } from '@playwright/test';

test('admin enhancements share one initial cached bootstrap request', async ({ page }) => {
  let cachedBootstrapRequests = 0;
  let hydratedBootstrapRequests = 0;

  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname !== '/api/admin/bootstrap') return;
    const channelMode = url.searchParams.get('channels');
    if (channelMode === '1') hydratedBootstrapRequests += 1;
    else if (!channelMode) cachedBootstrapRequests += 1;
  });

  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#reactionPanel')).toBeVisible();
  await expect(page.locator('#discordPreviewPanel')).toBeVisible();
  await expect(page.locator('#announcementPanel')).toBeVisible();
  await expect(page.locator('#calendarSettingsPanel')).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(cachedBootstrapRequests).toBe(2);
  expect(hydratedBootstrapRequests).toBe(1);
});
