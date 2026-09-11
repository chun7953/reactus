import { expect, test } from '@playwright/test';

const PUBLIC_PAGES = [
  '/',
  '/reference.html',
  '/discord-scheduled-posts.html',
  '/discord-google-calendar.html',
  '/discord-giveaway-bot.html',
];

test('major public pages expose both privacy and terms from the footer', async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    const footer = page.locator('footer.site-footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy.html');
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms.html');
  }
});

test('official reference lists terms as a canonical public source', async ({ page }) => {
  await page.goto('/reference.html');
  const officialSources = page.locator('#official-sources');
  await expect(officialSources.getByRole('link', { name: 'プライバシーポリシー' }))
    .toHaveAttribute('href', 'https://reactus.fly.dev/privacy.html');
  await expect(officialSources.getByRole('link', { name: '利用規約' }))
    .toHaveAttribute('href', 'https://reactus.fly.dev/terms.html');
});
