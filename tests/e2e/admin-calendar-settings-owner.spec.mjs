import { expect, test } from '@playwright/test';

const GENERAL = '100000000000000101';
const GIVEAWAY = '100000000000000102';
const READ_ONLY = '100000000000000103';

function monitor(index, { readOnly = false } = {}) {
  const giveaway = !readOnly && index % 3 === 0;
  return {
    id: index,
    channelId: readOnly ? READ_ONLY : (giveaway ? GIVEAWAY : GENERAL),
    channelName: readOnly ? 'readonly' : (giveaway ? 'giveaway' : 'general'),
    calendarId: `calendar-${index}@example.test`,
    triggerKeyword: giveaway ? 'ラキショ' : `ご連絡${index}`,
    defaultMentionRoleId: '200000000000000001',
    mentionRoleId: '200000000000000001',
    canManage: !readOnly,
  };
}

test('calendar settings owner renders permissions, final labels and pagination without repair observers', async ({ page }) => {
  await page.route('**/api/admin/bootstrap**', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const monitors = [
      ...Array.from({ length: 9 }, (_, index) => monitor(index + 1)),
      monitor(10, { readOnly: true }),
    ];
    await route.fulfill({ response, json: { ...body, monitors } });
  });

  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#calendarSettingsPanel')).toBeAttached();
  await page.locator('#calendarSettingsPanel details').evaluate(node => { node.open = true; });

  const channelValues = await page.locator('#calendarSettingChannel option').evaluateAll(options => options.map(option => option.value));
  expect(channelValues).not.toContain(READ_ONLY);
  expect(channelValues).toContain(GENERAL);
  expect(channelValues).toContain(GIVEAWAY);

  const cards = page.locator('#calendarSettingList > .calendar-setting-card');
  const visibleCards = page.locator('#calendarSettingList > .calendar-setting-card:visible');
  const status = page.locator('#calendarSettingStatus');
  await expect(cards).toHaveCount(10);
  await expect(visibleCards).toHaveCount(8);
  await expect(status).toHaveText('10件 · 1 / 2ページ');

  const readOnlyCard = cards.filter({ hasText: '#readonly' });
  await expect(readOnlyCard).toHaveCount(1);
  await expect(readOnlyCard).toContainText('通常投稿');
  await expect(readOnlyCard).toContainText('閲覧のみ');
  await expect(readOnlyCard).not.toContainText('【');
  await expect(readOnlyCard.locator('.event-actions button')).toHaveCount(0);

  await page.locator('#calendarSettingNext').click();
  await expect(visibleCards).toHaveCount(2);
  await expect(status).toHaveText('10件 · 2 / 2ページ');

  await page.locator('#calendarSettingSearch').fill('readonly');
  await expect(visibleCards).toHaveCount(1);
  await expect(status).toHaveText('1件一致 · 1 / 1ページ');
  await expect(readOnlyCard).toBeVisible();

  await page.locator('#calendarSettingSearch').fill('');
  await expect(visibleCards).toHaveCount(8);
  await expect(status).toHaveText('10件 · 1 / 2ページ');

  await expect(page.locator('label', { hasText: 'Googleカレンダーから直接作る予定の合図' })).toBeVisible();
});
