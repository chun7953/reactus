import { expect, test } from '@playwright/test';

test('valid admin session clears stale expired-login state in the core lifecycle', async ({ page }) => {
  await page.goto('/admin?login=expired');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#notice')).toBeHidden();
  await expect(page).toHaveURL(/\/admin$/);
});
