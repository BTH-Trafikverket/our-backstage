import { test, expect, type Page } from '@playwright/test';

const badgeTitle = `E2E Badge ${Date.now()}`;
const updatedBadgeTitle = `${badgeTitle} Updated`;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function badgeRow(page: Page, title: string) {
  return page.getByLabel(new RegExp(`^${escapeRegex(title)}`));
}

async function signInAndOpenAdminBadges(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Guest', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('link', { name: 'Quests' })).toBeVisible();
  await page.getByRole('link', { name: 'Quests' }).click();
  await page.getByRole('tab', { name: 'Badges' }).click();
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
  test('creates a badge', async ({ page }) => {
    await signInAndOpenAdminBadges(page);

    await page.getByRole('button', { name: 'Create badge' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill(badgeTitle);
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by the admin badge CRUD E2E flow');
    await page.getByRole('textbox', { name: 'XP reward' }).fill('200');
    await selectQuestCriterion(page, 'Merge a PR');
    await page
      .getByLabel('Create badge')
      .getByRole('button', { name: 'Create badge' })
      .click();

    await searchBadges(page, badgeTitle);
    await expect(badgeRow(page, badgeTitle)).toBeVisible();
    await expect(badgeRow(page, badgeTitle)).toContainText('200 XP');
  });

  test('edits a badge', async ({ page }) => {
    await signInAndOpenAdminBadges(page);

    await searchBadges(page, badgeTitle);
    await expect(badgeRow(page, badgeTitle)).toBeVisible();
    await badgeRow(page, badgeTitle)
      .getByRole('button', { name: 'Edit' })
      .click();
    await page.getByRole('textbox', { name: 'Title' }).fill(updatedBadgeTitle);
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Updated by the admin badge CRUD E2E flow');
    await page.getByRole('textbox', { name: 'XP reward' }).fill('250');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await searchBadges(page, updatedBadgeTitle);
    await expect(badgeRow(page, updatedBadgeTitle)).toBeVisible();
    await expect(badgeRow(page, updatedBadgeTitle)).toContainText('250 XP');
  });

  test('archives a badge', async ({ page }) => {
    await signInAndOpenAdminBadges(page);

    await searchBadges(page, updatedBadgeTitle);
    await expect(badgeRow(page, updatedBadgeTitle)).toBeVisible();
    await badgeRow(page, updatedBadgeTitle)
      .getByRole('button', { name: 'Archive' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Archive badge' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Archive badge' }).click();

    await expect(badgeRow(page, updatedBadgeTitle)).toContainText('Archived');
  });
});
