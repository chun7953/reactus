import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

test('public homepage presents the current Reactus workflow without horizontal overflow', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page).toHaveTitle(/Reactus \| Discord × Google Calendar/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Discord運用を');
  await expect(page.getByText('日本語のWeb管理画面')).toBeVisible();
  await expect(page.getByRole('heading', { name: '予定を作るところから、Discordに届くところまで。' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '普段の設定は、コマンドではなく画面から。' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '導入済みなら、まず管理画面を開く。' })).toBeVisible();
  await expect(page.getByText('Discordで /reactus を実行')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('`/reactus`');

  const tryLink = page.getByRole('link', { name: 'Reactus開発室で試す' });
  await expect(tryLink).toHaveAttribute('href', 'https://discord.gg/m6mFzzEQhr');
  await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy.html');
  await expect(page.getByRole('link', { name: 'GitHubを見る' })).toHaveAttribute('href', 'https://github.com/chun7953/reactus');

  await expectNoHorizontalOverflow(page);
});

test('privacy page shares the rebuilt public layout and remains readable', async ({ page }) => {
  await page.goto('/privacy.html');

  await expect(page).toHaveTitle('プライバシーポリシー | Reactus');
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '収集する情報' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reactus トップ' })).toHaveAttribute('href', '/');

  await expectNoHorizontalOverflow(page);
});
