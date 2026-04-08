import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { guestStorageStatePath } from './guestAuth';

const questTitle = `E2E Quest ${Date.now()}`;
const updatedQuestTitle = `${questTitle} Updated`;

test.use({ storageState: guestStorageStatePath });

let context: BrowserContext;
let sharedPage: Page;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function questRow(page: Page, title: string) {
  return page.getByLabel(new RegExp(`^${escapeRegex(title)}`));
}

async function openAdminQuestsPage(page: Page) {
  await page.goto('/gamification');
  await expect(page.getByRole('button', { name: 'Create quest' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/gamification$/);
}

async function searchQuests(page: Page, value: string) {
  await page.getByRole('searchbox', { name: 'Search quests' }).fill(value);
}

test.describe.serial('admin quest crud', () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ storageState: guestStorageStatePath });
    sharedPage = await context.newPage();
    await openAdminQuestsPage(sharedPage);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('creates a quest', async () => {
    await sharedPage.getByRole('button', { name: 'Create quest' }).click();
    await sharedPage.getByRole('textbox', { name: 'Title' }).fill(questTitle);
    await sharedPage
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by the admin quest CRUD E2E flow');
    await sharedPage.getByRole('button', { name: 'One-time' }).click();
    await sharedPage.getByRole('textbox', { name: 'Target' }).fill('1');
    await sharedPage.getByRole('textbox', { name: 'XP reward' }).fill('200');
    await sharedPage
      .getByLabel('Create quest')
      .getByRole('button', { name: 'Create quest' })
      .click();

    await searchQuests(sharedPage, questTitle);
    await expect(questRow(sharedPage, questTitle)).toBeVisible();
  });

  test('edits a quest', async () => {
    await searchQuests(sharedPage, questTitle);
    await expect(questRow(sharedPage, questTitle)).toBeVisible();
    await questRow(sharedPage, questTitle)
      .getByRole('button', { name: 'Edit' })
      .click();
    await sharedPage
      .getByRole('textbox', { name: 'Title' })
      .fill(updatedQuestTitle);
    await sharedPage
      .getByRole('textbox', { name: 'Description' })
      .fill('Updated by the admin quest CRUD E2E flow');
    await sharedPage.getByRole('textbox', { name: 'XP reward' }).fill('250');
    await sharedPage.getByRole('button', { name: 'Save changes' }).click();

    await searchQuests(sharedPage, updatedQuestTitle);
    await expect(questRow(sharedPage, updatedQuestTitle)).toBeVisible();
  });

  test('archives a quest', async () => {
    await searchQuests(sharedPage, updatedQuestTitle);
    await expect(questRow(sharedPage, updatedQuestTitle)).toBeVisible();
    await questRow(sharedPage, updatedQuestTitle)
      .getByRole('button', { name: 'Archive' })
      .click();
    await expect(
      sharedPage.getByRole('heading', { name: 'Archive quest' }),
    ).toBeVisible();
    await sharedPage.getByRole('button', { name: 'Archive quest' }).click();

    await expect(questRow(sharedPage, updatedQuestTitle)).toContainText(
      'Archived',
    );
  });
});
