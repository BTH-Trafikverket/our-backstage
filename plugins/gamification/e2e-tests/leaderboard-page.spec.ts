import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { guestStorageStatePath } from './guestAuth';

test.use({ storageState: guestStorageStatePath });
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let sharedPage: Page;

async function openLeaderboardPage(page: Page) {
  await page.goto('/gamification/leaderboard');
  await expect(
    page.getByRole('heading', { name: 'Leaderboard' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/gamification\/leaderboard$/);
}

async function expectLeaderboardEntriesOrEmptyState(
  page: Page,
  expectedRow: string,
) {
  await expect(
    page
      .getByRole('rowheader', { name: expectedRow })
      .or(page.getByText('No leaderboard entries to show.')),
  ).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: guestStorageStatePath });
  sharedPage = await context.newPage();
  await openLeaderboardPage(sharedPage);
});

test.afterAll(async () => {
  await context.close();
});

test('loads the leaderboard page', async () => {
  await expect(sharedPage.getByText('Alice')).toBeVisible();
});

test('filters leaderboard by search term', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search leaderboard' })
    .fill('Alice');
  await expect(sharedPage.getByText('Alice')).toBeVisible();

  await sharedPage
    .getByRole('searchbox', { name: 'Search leaderboard' })
    .fill('No such leaderboard user');
  await expect(
    sharedPage.getByText('No leaderboard entries match this search.'),
  ).toBeVisible();
});

test('switches between individual and team leaderboard', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search leaderboard' })
    .fill('');

  await sharedPage.getByRole('button', { name: 'Teams' }).click();
  await expect(
    sharedPage.getByRole('rowheader', { name: 'Admin' }),
  ).toBeVisible();

  await sharedPage.getByRole('button', { name: 'Individuals' }).click();
  await expect(
    sharedPage.getByRole('rowheader', { name: 'Alice' }),
  ).toBeVisible();
});

test('changes leaderboard time range', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search leaderboard' })
    .fill('');

  await sharedPage.getByRole('button', { name: 'Teams' }).click();
  await expect(
    sharedPage.getByRole('rowheader', { name: 'Admin' }),
  ).toBeVisible();

  await sharedPage.getByRole('button', { name: 'Monthly' }).click();
  await expectLeaderboardEntriesOrEmptyState(sharedPage, 'Admin');

  await sharedPage.getByRole('button', { name: 'Weekly' }).click();
  await expectLeaderboardEntriesOrEmptyState(sharedPage, 'Admin');

  await sharedPage.getByRole('button', { name: 'Individuals' }).click();
  await sharedPage.getByRole('button', { name: 'All time' }).click();
  await expect(
    sharedPage.getByRole('rowheader', { name: 'Alice' }),
  ).toBeVisible();
});
