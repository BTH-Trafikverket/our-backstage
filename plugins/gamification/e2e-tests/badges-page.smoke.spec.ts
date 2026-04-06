import { test, expect, type Page } from '@playwright/test';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function badgeRow(page: Page, title: string) {
  return page.getByLabel(new RegExp(`^${escapeRegex(title)}`));
}

async function signInAndOpenBadges(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Guest', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('link', { name: 'Quests' })).toBeVisible();
  await page.getByRole('link', { name: 'Quests' }).click();
  await page.getByRole('tab', { name: 'Badges' }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search badges' }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/gamification\/badges$/);
}

test('loads the badges page with seeded badge rows', async ({ page }) => {
  await signInAndOpenBadges(page);

  await page
    .getByRole('searchbox', { name: 'Search badges' })
    .fill('First Merge');
  await expect(badgeRow(page, 'First Merge')).toBeVisible();

  await page
    .getByRole('searchbox', { name: 'Search badges' })
    .fill('All-round Contributor');
  await expect(badgeRow(page, 'All-round Contributor')).toBeVisible();
});

test('filters badges by search term', async ({ page }) => {
  await signInAndOpenBadges(page);

  await page
    .getByRole('searchbox', { name: 'Search badges' })
    .fill('First Merge');

  await expect(badgeRow(page, 'First Merge')).toBeVisible({ timeout: 15_000 });
  await expect(badgeRow(page, 'All-round Contributor')).toHaveCount(0);
});
