import { test, expect, type Page } from '@playwright/test';

async function signInAndOpenLeaderboard(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Guest', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('link', { name: 'Quests' })).toBeVisible();
  await page.getByRole('link', { name: 'Quests' }).click();
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  await expect(
    page.getByRole('heading', { name: 'Leaderboard' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/gamification\/leaderboard$/);
}

test('loads the leaderboard page', async ({ page }) => {
  await signInAndOpenLeaderboard(page);

  await expect(page.getByText('Alice')).toBeVisible();
});

test('filters leaderboard by search term', async ({ page }) => {
  await signInAndOpenLeaderboard(page);

  await page
    .getByRole('searchbox', { name: 'Search leaderboard' })
    .fill('Alice');
  await expect(page.getByText('Alice')).toBeVisible();

  await page
    .getByRole('searchbox', { name: 'Search leaderboard' })
    .fill('No such leaderboard user');
  await expect(
    page.getByText('No leaderboard entries match this search.'),
  ).toBeVisible();
});

test('switches between individual and team leaderboard', async ({ page }) => {
  await signInAndOpenLeaderboard(page);

  await page.getByRole('button', { name: 'Teams' }).click();
  await expect(page.getByRole('rowheader', { name: 'Admin' })).toBeVisible();

  await page.getByRole('button', { name: 'Individuals' }).click();
  await expect(page.getByRole('rowheader', { name: 'Alice' })).toBeVisible();
});

test('changes leaderboard time range', async ({ page }) => {
  await signInAndOpenLeaderboard(page);

  await page.getByRole('button', { name: 'Teams' }).click();
  await expect(page.getByRole('rowheader', { name: 'Admin' })).toBeVisible();

  await page.getByRole('button', { name: 'Monthly' }).click();
  await expect(page.getByRole('rowheader', { name: 'Admin' })).toBeVisible();

  await page.getByRole('button', { name: 'Weekly' }).click();
  await expect(page.getByRole('rowheader', { name: 'Admin' })).toBeVisible();

  await page.getByRole('button', { name: 'Individuals' }).click();
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByRole('rowheader', { name: 'Alice' })).toBeVisible();
});
