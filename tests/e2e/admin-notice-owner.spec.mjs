import { expect, test } from '@playwright/test';

test('a newer admin notice is not hidden by an older notice timer', async ({ page }) => {
  // The fixture contains September 2026 events; freeze the browser clock so
  // this test does not begin navigating in the real current month.
  await page.clock.install({ time: new Date('2026-09-09T10:00:00+09:00') });
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
