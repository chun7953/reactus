import { expect, test } from '@playwright/test';

const FIXED_NOW = '2026-09-09T06:00:00.000Z';

async function freezeClock(page) {
  await page.addInitScript(({ fixedNow }) => {
    const NativeDate = Date;
    const fixedTime = NativeDate.parse(fixedNow);
    const startedAt = performance.now();
    const advancingNow = () => fixedTime + (performance.now() - startedAt);
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [advancingNow()]));
      }
      static now() { return advancingNow(); }
    }
    window.Date = FixedDate;
  }, { fixedNow: FIXED_NOW });
}

test('month consumers reconnect from the explicit render lifecycle after month navigation', async ({ page }, testInfo) => {
  await freezeClock(page);
  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#monthLabel')).toHaveText('2026年9月');
  await expect(page.locator('#monthGrid .month-day')).toHaveCount(42);

  await page.locator('#monthNext').click();
  await expect(page.locator('#monthLabel')).toHaveText('2026年10月');
  await page.locator('#monthPrev').click();
  await expect(page.locator('#monthLabel')).toHaveText('2026年9月');
  await expect(page.locator('#monthGrid .month-day')).toHaveCount(42);

  await expect(page.locator('#monthGrid .month-add-schedule')).toHaveCount(42);

  const day9 = page.locator('[data-reactus-date="2026-09-09"]');
  await expect(day9).toHaveAttribute('data-reactus-drop-bound', '1');

  const event = day9.locator('.month-event').filter({ hasText: '朝のお知らせ' });
  await expect(event).toHaveAttribute('data-reactus-edit-bound', '1');
  await expect(event).toHaveAttribute('data-reactus-drag-bound', '1');
  await expect(event).toHaveAttribute('draggable', 'true');

  const quickCreate = day9.locator('.month-add-schedule');
  await quickCreate.click();
  await expect(page.locator('#startTime')).toHaveValue(/^2026-09-09T/);

  if (testInfo.project.name === 'mobile-chromium') {
    const badge = day9.locator('.reactus-mobile-event-count');
    await expect(badge).toHaveText('2');
    await badge.click();
    await expect(page.locator('#reactusMobileDayInline')).toBeVisible();
    await expect(page.locator('#reactusMobileDayInlineList .reactus-mobile-day-inline-event')).toHaveCount(2);
    await page.locator('[data-close-mobile-day-inline]').click();
    await expect(page.locator('#reactusMobileDayInline')).not.toBeVisible();
  }
});
