import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { guestStorageStatePath } from './guestAuth';

test.use({ storageState: guestStorageStatePath });
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let sharedPage: Page;

async function openQuestsPage(page: Page) {
  await page.goto('/gamification');
  await expect(page.getByRole('button', { name: 'Create quest' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/gamification$/);
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: guestStorageStatePath });
  sharedPage = await context.newPage();
  await openQuestsPage(sharedPage);
});

test.afterAll(async () => {
  await context.close();
});

test('loads the quests page with seeded quest rows', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search quests' })
    .fill('Merge a PR');
  await expect(sharedPage.getByText('Merge a PR')).toBeVisible();

  await sharedPage
    .getByRole('searchbox', { name: 'Search quests' })
    .fill('Security Patch Sweep');
  await expect(sharedPage.getByText('Security Patch Sweep')).toBeVisible();
});

test('filters quests by search term', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search quests' })
    .fill('Merge a PR');

  await expect(sharedPage.getByText('Merge a PR')).toBeVisible();
  await expect(sharedPage.getByText('Review PRs')).not.toBeVisible();
});
