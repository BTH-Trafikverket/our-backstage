import { test, expect, type Page } from '@playwright/test';

async function signInAndOpenQuests(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Guest', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('link', { name: 'Quests' })).toBeVisible();
  await page.getByRole('link', { name: 'Quests' }).click();
  await expect(page.getByRole('button', { name: 'Create quest' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/gamification$/);
}

test('loads the quests page with seeded quest rows', async ({ page }) => {
  await signInAndOpenQuests(page);

  await page
    .getByRole('searchbox', { name: 'Search quests' })
    .fill('Merge a PR');
  await expect(page.getByText('Merge a PR')).toBeVisible();

  await page
    .getByRole('searchbox', { name: 'Search quests' })
    .fill('Security Patch Sweep');
  await expect(page.getByText('Security Patch Sweep')).toBeVisible();
});

test('filters quests by search term', async ({ page }) => {
  await signInAndOpenQuests(page);

  await page
    .getByRole('searchbox', { name: 'Search quests' })
    .fill('Merge a PR');

  await expect(page.getByText('Merge a PR')).toBeVisible();
  await expect(page.getByText('Review PRs')).not.toBeVisible();
});
