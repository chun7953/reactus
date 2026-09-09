import { expect, test } from '@playwright/test';

const MANAGEABLE_CHANNEL = '100000000000000101';
const READ_ONLY_CHANNEL = '100000000000000103';

function rule(channelId, trigger) {
  return {
    channelId,
    trigger,
    emojis: [{ type: 'unicode', value: '✅' }],
    rawEmojis: '✅',
    invalid: false,
  };
}

test('reaction owner renders permissions directly and pagination follows its lifecycle', async ({ page }) => {
  let saved = false;

  await page.route('**/api/admin/bootstrap**', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const reactionRules = [
      ...Array.from({ length: 9 }, (_, index) => rule(MANAGEABLE_CHANNEL, `管理${index + 1}`)),
      rule(READ_ONLY_CHANNEL, '閲覧専用'),
    ];
    if (saved) reactionRules.push(rule(MANAGEABLE_CHANNEL, '保存後'));
    await route.fulfill({ response, json: { ...body, reactionRules } });
  });

  await page.route('**/api/admin/reactions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saved = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ backupOk: true }),
    });
  });

  await page.goto('/admin');
  await expect(page.locator('#reactionPanel')).toBeVisible();

  const optionValues = await page.locator('#reactionChannel option').evaluateAll(options => options.map(option => option.value));
  expect(optionValues).not.toContain(READ_ONLY_CHANNEL);
  expect(optionValues).toContain(MANAGEABLE_CHANNEL);

  const rows = page.locator('#reactionRules > .reaction-rule');
  const visibleRows = page.locator('#reactionRules > .reaction-rule:visible');
  const status = page.locator('#reactionRuleStatus');
  await expect(rows).toHaveCount(10);
  await expect(visibleRows).toHaveCount(8);
  await expect(status).toHaveText('10件 · 1 / 2ページ');

  const readOnlyRow = rows.filter({ hasText: '閲覧専用' });
  await expect(readOnlyRow).toHaveCount(1);
  await expect(readOnlyRow.locator('.reactus-readonly-badge')).toHaveText('閲覧のみ');
  await expect(readOnlyRow.locator('.reaction-actions button')).toHaveCount(0);

  await page.locator('#reactionRuleNext').click();
  await expect(visibleRows).toHaveCount(2);
  await expect(status).toHaveText('10件 · 2 / 2ページ');

  await page.locator('#reactionTrigger').fill('新しい設定');
  await page.locator('#standardEmojiGrid .emoji-button').first().click();
  await page.locator('#reactionSave').click();

  await expect(rows).toHaveCount(11);
  await expect(visibleRows).toHaveCount(8);
  await expect(status).toHaveText('11件 · 1 / 2ページ');
});
