import { expect, test } from '@playwright/test';

test('homepage exposes the active Google Search Console verification token', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute(
    'content',
    'xeGfPxOaHtvqQve0n9qCFpLcFckbuOR4LRk1QcMGyD8',
  );
});
