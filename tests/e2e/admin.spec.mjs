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

function collectRuntimeFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    if (message.type() === 'warning' && /runaway MutationObserver/i.test(message.text())) {
      failures.push(`observer: ${message.text()}`);
    }
  });
  return failures;
}

async function openAdmin(page) {
  await freezeClock(page);
  const failures = collectRuntimeFailures(page);
  await page.goto('/admin');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#monthLabel')).toHaveText('2026年9月');
  await expect(page.locator('#monthGrid .month-day')).toHaveCount(42);
  await expect(page.locator('#reactionPanel')).toBeVisible();
  return failures;
}

async function assertEventLoopResponsive(page) {
  const heartbeat = await page.evaluate(() => new Promise(resolve => {
    window.setTimeout(() => resolve('alive'), 50);
  }));
  expect(heartbeat).toBe('alive');
}

test('admin boots, renders overlapping events, and stays interactive', async ({ page }) => {
  const failures = await openAdmin(page);

  const day9 = page.locator('[data-reactus-date="2026-09-09"]');
  await expect(day9).toContainText('朝のお知らせ');
  await expect(day9).toContainText('連続イベント');

  const day15 = page.locator('[data-reactus-date="2026-09-15"]');
  await expect(day15.locator('.month-event')).toHaveCount(1);

  const day24 = page.locator('[data-reactus-date="2026-09-24"]');
  await expect(day24.locator('.month-event')).toHaveCount(6);
  await expect(day24.locator('.month-more')).toHaveText('ほか1件');

  const day25 = page.locator('[data-reactus-date="2026-09-25"]');
  await expect(day25.locator('.month-event')).toHaveCount(6);
  await expect(day25.locator('.month-more')).toHaveCount(0);

  await page.locator('#monthNext').click();
  await expect(page.locator('#monthLabel')).toHaveText('2026年10月');
  await page.locator('#monthPrev').click();
  await expect(page.locator('#monthLabel')).toHaveText('2026年9月');

  await page.getByRole('button', { name: '抽選', exact: true }).click();
  await expect(page.locator('#giveawayFields')).toBeVisible();
  await page.locator('#addPrize').click();
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await page.getByRole('button', { name: '通常投稿', exact: true }).click();
  await expect(page.locator('#postFields')).toBeVisible();

  const calendar = await page.locator('#calendarOverview').boundingBox();
  const schedule = await page.locator('#schedulePanel').boundingBox();
  expect(calendar).not.toBeNull();
  expect(schedule).not.toBeNull();
  expect(schedule.y).toBeGreaterThanOrEqual(calendar.y + calendar.height - 2);

  await assertEventLoopResponsive(page);
  await page.waitForTimeout(250);
  expect(failures).toEqual([]);
});

test('Discord giveaway preview follows prize add and remove without DOM observation', async ({ page }) => {
  const failures = await openAdmin(page);
  await expect(page.locator('#discordPreviewPanel')).toBeVisible();

  await page.getByRole('button', { name: '抽選', exact: true }).click();
  await expect(page.locator('#discordPreviewContent .discord-giveaway-preview')).toHaveCount(1);

  await page.locator('#addPrize').click();
  await expect(page.locator('.prize-row')).toHaveCount(2);
  await expect(page.locator('#discordPreviewContent .discord-giveaway-preview')).toHaveCount(2);

  await page.locator('.prize-row .danger').last().click();
  await expect(page.locator('.prize-row')).toHaveCount(1);
  await expect(page.locator('#discordPreviewContent .discord-giveaway-preview')).toHaveCount(1);

  await assertEventLoopResponsive(page);
  expect(failures).toEqual([]);
});

test('month event opens the editor from rendered metadata without refetching the event list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const failures = await openAdmin(page);
  const duplicateEventListRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/admin/events') duplicateEventListRequests.push(request.url());
  });

  const detailRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/admin/event');
  await page.locator('[data-reactus-date="2026-09-09"] .month-event').filter({ hasText: '朝のお知らせ' }).click();
  await detailRequest;

  await expect(page.locator('#editBanner')).toBeVisible();
  await expect(page.locator('#schedulePanel h2')).toHaveText('予定を編集');
  expect(duplicateEventListRequests).toEqual([]);
  await assertEventLoopResponsive(page);
  expect(failures).toEqual([]);
});

test('rich mention selection is sent directly in the schedule payload', async ({ page }) => {
  const failures = await openAdmin(page);

  await expect(page.locator('#richMentionEditor')).toBeVisible();
  await page.locator('#richMentionMode').selectOption('custom');
  await page.locator('#addEveryoneMention').click();
  await page.locator('#richMentionRole').selectOption('200000000000000001');
  await page.locator('#addRoleMention').click();
  await expect(page.locator('#richMentionTargets .rich-mention-chip')).toHaveCount(2);

  await page.locator('#title').fill('メンション経路テスト');
  await page.locator('#body').fill('構造化されたメンションが正規payloadへ入ることを確認します。');

  const requestPromise = page.waitForRequest(request => (
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/schedules'
  ));
  await page.locator('#submitButton').click();
  const request = await requestPromise;
  const payload = request.postDataJSON();

  expect(payload.mention).toEqual({
    mode: 'custom',
    targets: [
      { type: 'everyone' },
      { type: 'role', id: '200000000000000001' },
    ],
  });
  await expect(page.locator('#notice')).toContainText('Googleカレンダーへ登録しました');
  await assertEventLoopResponsive(page);
  expect(failures).toEqual([]);
});

test('desktop day overflow exposes all seven events without locking the page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const failures = await openAdmin(page);

  const day24 = page.locator('[data-reactus-date="2026-09-24"]');
  await day24.locator('.month-more').click();
  await expect(page.locator('#reactusCalendarDayDialog')).toBeVisible();
  await expect(page.locator('#reactusCalendarDayDialogList .reactus-day-dialog-event')).toHaveCount(7);
  await page.locator('#reactusCalendarDayDialogClose').click();
  await expect(page.locator('#reactusCalendarDayDialog')).not.toBeVisible();

  for (let index = 0; index < 4; index += 1) {
    await page.locator('#monthNext').click();
    await page.locator('#monthPrev').click();
  }
  await expect(page.locator('#monthLabel')).toHaveText('2026年9月');
  await assertEventLoopResponsive(page);
  expect(failures).toEqual([]);
});

test('mobile day badges show complete inline details for 7+ and spanning events without refetching the event list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const failures = await openAdmin(page);
  const duplicateEventListRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/admin/events') duplicateEventListRequests.push(request.url());
  });

  const day24Badge = page.locator('[data-reactus-date="2026-09-24"] .reactus-mobile-event-count');
  await expect(day24Badge).toHaveText('7');
  await day24Badge.click();

  const inline = page.locator('#reactusMobileDayInline');
  await expect(inline).toBeVisible();
  await expect(page.locator('#reactusMobileDayInlineList .reactus-mobile-day-inline-event')).toHaveCount(7);
  await expect(page.locator('#reactusMobileDayInlineList').getByText('予定', { exact: true })).toHaveCount(1);
  await expect(inline).toContainText('内部キーワードだけのタイトルでも詳細は空になりません。');
  await expect(inline).toContainText('🎁 テスト景品 × 2名');
  await expect(inline).toContainText('抽選の案内本文です。');

  await page.locator('[data-close-mobile-day-inline]').click();
  const day9Badge = page.locator('[data-reactus-date="2026-09-09"] .reactus-mobile-event-count');
  await expect(day9Badge).toHaveText('2');
  await day9Badge.click();
  await expect(inline).toContainText('連続イベント');
  await expect(inline).toContainText('前日から継続');
  await expect(inline).toContainText('8日夜から10日朝まで続く予定です。');

  const day5 = page.locator('[data-reactus-date="2026-09-05"]');
  await expect(day5.locator('.reactus-mobile-event-count')).toHaveCount(0);
  const day25Badge = page.locator('[data-reactus-date="2026-09-25"] .reactus-mobile-event-count');
  await expect(day25Badge).toHaveText('6');

  expect(duplicateEventListRequests).toEqual([]);
  await assertEventLoopResponsive(page);
  await page.waitForTimeout(250);
  expect(failures).toEqual([]);
});

test('calendar integration settings remain folded inside the calendar panel', async ({ page }) => {
  const failures = await openAdmin(page);
  const fold = page.locator('#calendarOverview details').filter({ hasText: 'カレンダー連携設定' }).first();
  await expect(fold).toBeVisible();
  await expect(fold).not.toHaveAttribute('open', '');
  await fold.locator('summary').click();
  await expect(fold).toHaveAttribute('open', '');
  await fold.locator('summary').click();
  await assertEventLoopResponsive(page);
  expect(failures).toEqual([]);
});

test('core editor owns recurring future scope and immediate loading feedback', async ({ page }) => {
  const failures = await openAdmin(page);
  let releaseInitialDetail;
  const initialDetailGate = new Promise(resolve => { releaseInitialDetail = resolve; });
  await page.route('**/api/admin/event?*', async route => {
    const scope = new URL(route.request().url()).searchParams.get('scope');
    if (scope === 'instance') await initialDetailGate;
    await route.continue();
  });

  const recurringCard = page.locator('#eventList .event-card')
    .filter({ hasText: '24日の予定5' });
  await recurringCard.getByRole('button', { name: '編集', exact: true }).click();

  await expect(page.locator('#editBanner')).toBeVisible();
  await expect(page.locator('#editBannerTitle')).toHaveText('「24日の予定5」を編集中');
  await expect(page.locator('#editBannerHint')).toHaveText('予定の内容を読み込んでいます…');

  releaseInitialDetail();
  await expect(page.locator('#editScopeWrap')).toBeVisible();
  await expect(page.locator('#editScope option')).toHaveCount(3);
  await expect(page.locator('#editScope option').nth(0)).toHaveText('この予定のみ');
  await expect(page.locator('#editScope option').nth(1)).toHaveText('これ以降の予定');
  await expect(page.locator('#editScope option').nth(2)).toHaveText('すべての予定');

  const futureRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/admin/event' && url.searchParams.get('scope') === 'future';
  });
  await page.locator('#editScope').selectOption('future');
  await futureRequest;
  await expect(page.locator('#editBannerTitle')).toHaveText('これ以降の予定を編集中');
  await expect(page.locator('#editBannerHint')).toHaveText(
    '選んだ回より前はそのまま残し、この回以降を新しい定期予定として編集します。',
  );
  await expect(page.locator('#repeatUnit')).toBeEnabled();
  await expect(page.locator('#image')).toBeEnabled();

  await assertEventLoopResponsive(page);
  expect(failures).toEqual([]);
});
