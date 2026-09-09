import { expect, test } from '@playwright/test';

test('announcement list owner renders Discord channel links without a repair observer', async ({ page }) => {
  await page.route('**/api/admin/announcements', async route => {
    const request = route.request();
    if (request.method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        announcements: [
          {
            channelId: '100000000000000101',
            message: '質問は <#100000000000000102> へお願いします。',
          },
        ],
      }),
    });
  });

  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();

  const text = page.locator('#announcementList .announcement-card-text').first();
  await expect(text).toContainText('質問は #giveaway へお願いします。');
  await expect(text.locator('.announcement-channel-preview')).toHaveText('#giveaway');
  await expect(text).not.toContainText('<#100000000000000102>');
});
