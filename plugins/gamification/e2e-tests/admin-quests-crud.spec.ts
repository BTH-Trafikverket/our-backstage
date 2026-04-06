import { test, expect, type Page } from '@playwright/test';

const questTitle = `E2E Quest ${Date.now()}`;
const updatedQuestTitle = `${questTitle} Updated`;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function questRow(page: Page, title: string) {
  return page.getByLabel(new RegExp(`^${escapeRegex(title)}`));
}

async function signInAndOpenAdminQuests(page: Page) {
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

async function searchQuests(page: Page, value: string) {
  await page.getByRole('searchbox', { name: 'Search quests' }).fill(value);
}

test.describe.serial('admin quest crud', () => {
  test('creates a quest', async ({ page }) => {
    await signInAndOpenAdminQuests(page);

    await page.getByRole('button', { name: 'Create quest' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill(questTitle);
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by the admin quest CRUD E2E flow');
    await page.getByRole('button', { name: 'One-time' }).click();
    await page.getByRole('textbox', { name: 'Target' }).fill('1');
    await page.getByRole('textbox', { name: 'XP reward' }).fill('200');
    await page
      .getByLabel('Create quest')
      .getByRole('button', { name: 'Create quest' })
      .click();

    await searchQuests(page, questTitle);
    await expect(questRow(page, questTitle)).toBeVisible();
  });

  test('edits a quest', async ({ page }) => {
    await signInAndOpenAdminQuests(page);

    await searchQuests(page, questTitle);
    await expect(questRow(page, questTitle)).toBeVisible();
    await questRow(page, questTitle)
      .getByRole('button', { name: 'Edit' })
      .click();
    await page.getByRole('textbox', { name: 'Title' }).fill(updatedQuestTitle);
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Updated by the admin quest CRUD E2E flow');
    await page.getByRole('textbox', { name: 'XP reward' }).fill('250');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await searchQuests(page, updatedQuestTitle);
    await expect(questRow(page, updatedQuestTitle)).toBeVisible();
  });

  test('archives a quest', async ({ page }) => {
    await signInAndOpenAdminQuests(page);

    await searchQuests(page, updatedQuestTitle);
    await expect(questRow(page, updatedQuestTitle)).toBeVisible();
    await questRow(page, updatedQuestTitle)
      .getByRole('button', { name: 'Archive' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Archive quest' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Archive quest' }).click();

    await expect(questRow(page, updatedQuestTitle)).toContainText('Archived');
  });
});
