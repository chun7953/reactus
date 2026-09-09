import { expect, test } from '@playwright/test';

const MANAGEABLE_NORMAL = '3001';
const MANAGEABLE_DUPLICATE = '3002';
const MANAGEABLE_GIVEAWAY = '3003';
const READ_ONLY = '3004';

function monitor(id, channelId, channelName, triggerKeyword, canManage, calendarId, calendarName) {
  return { id, channelId, channelName, triggerKeyword, canManage, calendarId, calendarName };
}

test('schedule editor owns destination permissions, labels and refresh lifecycle', async ({ page }) => {
  let hydrationRequests = 0;
  let refreshRequests = 0;

  await page.route('**/api/admin/bootstrap**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('channels') === '1') hydrationRequests += 1;
    if (url.searchParams.get('channels') === 'refresh') refreshRequests += 1;
    const response = await route.fetch();
    const body = await response.json();
    const monitors = [
      monitor(MANAGEABLE_NORMAL, '100000000000000101', 'general', '通常', true, 'main@example.com', 'メイン'),
      monitor(MANAGEABLE_DUPLICATE, '100000000000000101', 'general', '告知', true, 'sub@example.com', 'サブ'),
      monitor(MANAGEABLE_GIVEAWAY, '100000000000000102', 'giveaway', 'ラキショ', true, 'main@example.com', 'メイン'),
      monitor(READ_ONLY, '100000000000000103', 'readonly', '通常', false, 'readonly@example.com', '閲覧専用'),
    ];
    await route.fulfill({ response, json: { ...body, monitors } });
  });

  await page.goto('/admin');
  await expect.poll(() => hydrationRequests).toBeGreaterThan(0);
  await page.waitForTimeout(75);
  await expect(page.locator('#monitor')).toBeVisible();

  const normal = page.locator('#monitor option');
  await expect(normal).toHaveCount(2);
  await expect(normal.nth(0)).toHaveText('#general (メイン)');
  await expect(normal.nth(1)).toHaveText('#general (サブ)');
  expect(await normal.evaluateAll(options => options.map(option => option.value))).not.toContain(READ_ONLY);

  let before = refreshRequests;
  await page.locator('.segment[data-type="giveaway"]').click();
  await expect.poll(() => refreshRequests).toBeGreaterThan(before);
  await page.waitForTimeout(75);
  await expect(page.locator('#monitor option')).toHaveCount(1);
  await expect(page.locator('#monitor option')).toHaveText('#giveaway');

  await page.locator('#title').focus();
  before = refreshRequests;
  await page.locator('#monitor').focus();
  await expect.poll(() => refreshRequests).toBeGreaterThan(before);
  await page.waitForTimeout(75);
  await expect(page.locator('#monitor option')).toHaveText('#giveaway');

  before = refreshRequests;
  await page.locator('.segment[data-type="post"]').click();
  await expect.poll(() => refreshRequests).toBeGreaterThan(before);
  await page.waitForTimeout(75);
  await expect(page.locator('#monitor option')).toHaveCount(2);
  await page.locator('#monitor').selectOption(MANAGEABLE_DUPLICATE);
  await page.locator('#title').focus();
  before = refreshRequests;
  await page.locator('#monitor').focus();
  await expect.poll(() => refreshRequests).toBeGreaterThan(before);
  await page.waitForTimeout(75);
  await expect(page.locator('#monitor')).toHaveValue(MANAGEABLE_DUPLICATE);
});
