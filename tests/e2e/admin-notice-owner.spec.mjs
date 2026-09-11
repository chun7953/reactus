import { expect, test } from '@playwright/test';

test('a newer admin notice is not hidden by an older notice timer', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();

  await page.locator('[data-reactus-date="2026-09-09"] .month-add-schedule').click();
  await expect(page.locator('#notice')).toContainText('2026/09/09 の予定を作成します。');

  await page.getByRole('button', { name: '抽選', exact: true }).click();
  await page.locator('.prize-row .danger').click();
  await expect(page.locator('#notice')).toContainText('景品は1つ以上必要です。');

  await page.waitForTimeout(5250);
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#notice')).toContainText('景品は1つ以上必要です。');
});
