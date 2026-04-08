import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { guestStorageStatePath } from './guestAuth';

const badgeTitle = `E2E Badge ${Date.now()}`;
const updatedBadgeTitle = `${badgeTitle} Updated`;

test.use({ storageState: guestStorageStatePath });

let context: BrowserContext;
let sharedPage: Page;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function badgeRow(page: Page, title: string) {
  return page.getByLabel(new RegExp(`^${escapeRegex(title)}`));
}

async function openAdminBadgesPage(page: Page) {
  await page.goto('/gamification/badges');
  await expect(page.getByRole('button', { name: 'Create badge' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/gamification\/badges$/);
}

async function searchBadges(page: Page, value: string) {
  await page.getByRole('searchbox', { name: 'Search badges' }).fill(value);
}

async function selectQuestCriterion(page: Page, questTitle: string) {
  await page
    .getByRole('button', {
      name: /Select a user quest.*criterion 1/i,
    })
    .click();
  await page.getByRole('option', { name: questTitle, exact: true }).click();
}

test.describe.serial('admin badge crud', () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ storageState: guestStorageStatePath });
    sharedPage = await context.newPage();
    await openAdminBadgesPage(sharedPage);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('creates a badge', async () => {
    await sharedPage.getByRole('button', { name: 'Create badge' }).click();
    await sharedPage.getByRole('textbox', { name: 'Title' }).fill(badgeTitle);
    await sharedPage
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by the admin badge CRUD E2E flow');
    await sharedPage.getByRole('textbox', { name: 'XP reward' }).fill('200');
    await selectQuestCriterion(sharedPage, 'Merge a PR');
    await sharedPage
      .getByLabel('Create badge')
      .getByRole('button', { name: 'Create badge' })
      .click();

    await searchBadges(sharedPage, badgeTitle);
    await expect(badgeRow(sharedPage, badgeTitle)).toBeVisible();
    await expect(badgeRow(sharedPage, badgeTitle)).toContainText('200 XP');
  });

  test('edits a badge', async () => {
    await searchBadges(sharedPage, badgeTitle);
    await expect(badgeRow(sharedPage, badgeTitle)).toBeVisible();
    await badgeRow(sharedPage, badgeTitle)
      .getByRole('button', { name: 'Edit' })
      .click();
    await sharedPage
      .getByRole('textbox', { name: 'Title' })
      .fill(updatedBadgeTitle);
    await sharedPage
      .getByRole('textbox', { name: 'Description' })
      .fill('Updated by the admin badge CRUD E2E flow');
    await sharedPage.getByRole('textbox', { name: 'XP reward' }).fill('250');
    await sharedPage.getByRole('button', { name: 'Save changes' }).click();

    await searchBadges(sharedPage, updatedBadgeTitle);
    await expect(badgeRow(sharedPage, updatedBadgeTitle)).toBeVisible();
    await expect(badgeRow(sharedPage, updatedBadgeTitle)).toContainText(
      '250 XP',
    );
  });

  test('archives a badge', async () => {
    await searchBadges(sharedPage, updatedBadgeTitle);
    await expect(badgeRow(sharedPage, updatedBadgeTitle)).toBeVisible();
    await badgeRow(sharedPage, updatedBadgeTitle)
      .getByRole('button', { name: 'Archive' })
      .click();
    await expect(
      sharedPage.getByRole('heading', { name: 'Archive badge' }),
    ).toBeVisible();
    await sharedPage.getByRole('button', { name: 'Archive badge' }).click();

    await expect(badgeRow(sharedPage, updatedBadgeTitle)).toContainText(
      'Archived',
    );
  });
});
