import { expect, test } from '@playwright/test';

test('upcoming list follows the core render lifecycle without DOM observation', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();

  const cards = page.locator('#eventList > .event-card');
  const visibleCards = page.locator('#eventList > .event-card:visible');
  const status = page.locator('#upcomingPaginationStatus');

  await expect(cards).toHaveCount(16);
  await expect(visibleCards).toHaveCount(12);
  await expect(status).toHaveText('12 / 16件を表示');
  await expect(page.locator('#upcomingMore')).toHaveText('さらに4件表示');
  await expect(page.getByRole('link', { name: 'Googleカレンダーで開く', exact: true })).toHaveCount(2);

  await page.locator('#upcomingMore').click();
  await expect(visibleCards).toHaveCount(16);
  await expect(status).toHaveText('16 / 16件を表示');

  await page.locator('#upcomingCollapse').click();
  await expect(visibleCards).toHaveCount(12);
  await expect(status).toHaveText('12 / 16件を表示');

  await page.locator('#eventSearch').fill('秋の抽選');
  await expect(visibleCards).toHaveCount(1);
  await expect(status).toHaveText('1件が一致');
  await page.locator('#eventSearch').fill('');
  await expect(visibleCards).toHaveCount(12);

  const refreshed = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/admin/events' && url.searchParams.get('refresh') === '1';
  });
  await page.locator('#refreshEvents').click();
  await refreshed;
  await expect(cards).toHaveCount(16);
  await expect(visibleCards).toHaveCount(12);
  await expect(status).toHaveText('12 / 16件を表示');
});
