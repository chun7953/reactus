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

test('month calendar owns request failure recovery without an external guard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await freezeClock(page);
  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#monthGrid .month-day')).toHaveCount(42);

  let failEventLists = true;
  await page.route(/\/api\/admin\/events(?:\?|$)/, async route => {
    if (failEventLists) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.locator('#refreshEvents').click();
  await expect(page.locator('#monthGrid .reactus-month-error')).toBeVisible();
  const retry = page.getByRole('button', { name: 'カレンダーを再読み込み' });
  await expect(retry).toBeVisible();

  failEventLists = false;
  await retry.click();
  await expect(page.locator('#monthGrid .month-day')).toHaveCount(42);
  await expect(page.locator('#monthGrid .reactus-month-error')).toHaveCount(0);
});
