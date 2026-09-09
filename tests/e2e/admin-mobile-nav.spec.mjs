import { expect, test } from '@playwright/test';

test('mobile navigation is installed directly after authenticated admin startup', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');

  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();

  const nav = page.locator('#reactusMobileNav');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button')).toHaveCount(5);

  const createButton = nav.getByRole('button', { name: '作成', exact: true });
  await createButton.click();
  await expect(page.locator('#schedulePanel')).toBeVisible();
});
