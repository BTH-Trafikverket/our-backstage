import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { guestStorageStatePath } from './guestAuth';

test.use({ storageState: guestStorageStatePath });
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let sharedPage: Page;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function badgeRow(page: Page, title: string) {
  return page.getByLabel(new RegExp(`^${escapeRegex(title)}`));
}

async function openBadgesPage(page: Page) {
  await page.goto('/gamification/badges');
  await expect(
    page.getByRole('searchbox', { name: 'Search badges' }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/gamification\/badges$/);
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: guestStorageStatePath });
  sharedPage = await context.newPage();
  await openBadgesPage(sharedPage);
});

test.afterAll(async () => {
  await context.close();
});

test('loads the badges page with seeded badge rows', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search badges' })
    .fill('First Merge');
  await expect(badgeRow(sharedPage, 'First Merge')).toBeVisible();

  await sharedPage
    .getByRole('searchbox', { name: 'Search badges' })
    .fill('All-round Contributor');
  await expect(badgeRow(sharedPage, 'All-round Contributor')).toBeVisible();
});

test('filters badges by search term', async () => {
  await sharedPage
    .getByRole('searchbox', { name: 'Search badges' })
    .fill('First Merge');

  await expect(badgeRow(sharedPage, 'First Merge')).toBeVisible({
    timeout: 15_000,
  });
  await expect(badgeRow(sharedPage, 'All-round Contributor')).toHaveCount(0);
});
