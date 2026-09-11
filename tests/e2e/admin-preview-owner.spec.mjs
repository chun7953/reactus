import { expect, test } from '@playwright/test';

function collectRuntimeFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  return failures;
}

test('Discord preview follows the async image owner without a repair timer', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#discordPreviewPanel')).toBeVisible();

  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('#image').setInputFiles({
    name: 'preview.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });

  await expect(page.locator('#imagePreview')).toBeVisible();
  await expect(page.locator('#discordPreviewContent .discord-preview-image')).toHaveCount(1);

  await page.locator('#clearImage').click();
  await expect(page.locator('#imagePreview')).toBeHidden();
  await expect(page.locator('#discordPreviewContent .discord-preview-image')).toHaveCount(0);

  expect(failures).toEqual([]);
});
