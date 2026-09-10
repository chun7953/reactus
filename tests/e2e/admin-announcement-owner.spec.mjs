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

test('announcement owner warns about repeated mentions and canceling confirmation prevents save', async ({ page }) => {
  let postCount = 0;
  await page.route('**/api/admin/announcements', async route => {
    if (route.request().method() === 'POST') postCount += 1;
    await route.continue();
  });

  await page.goto('/admin');
  await expect(page.locator('#announcementPanel')).toBeVisible();
  await page.locator('#announcementChannel').selectOption('100000000000000101');
  await page.locator('#announcementMessage').fill('@everyone 更新があります。');

  const warning = page.locator('#announcementMentionWarning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('@everyone');
  await expect(warning).toContainText('そのたびに通知される可能性があります');
  await expect(page.locator('#announcementChannelLinkNote')).toContainText('チャンネルへのリンクは通知を送りません');

  let confirmation = '';
  page.once('dialog', async dialog => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await page.locator('#announcementSave').click();

  expect(confirmation).toContain('メンションも繰り返し通知される可能性があります');
  expect(postCount).toBe(0);
  await expect(page.locator('#announcementSave')).toBeEnabled();

  await page.locator('#announcementMessage').fill('通常の案内です。');
  await expect(warning).toBeHidden();
});
