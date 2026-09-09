import { expect, test } from '@playwright/test';

test('mobile layout has no fixed navigation and keeps calendar settings inside the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');

  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#reactusMobileNav')).toHaveCount(0);

  const fold = page.locator('#calendarOverview details').filter({ hasText: 'カレンダー連携設定' }).first();
  await expect(fold).toBeVisible();
  await fold.locator('summary').click();
  await expect(fold).toHaveAttribute('open', '');

  const bounds = await fold.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(394);

  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth + 1);
});
