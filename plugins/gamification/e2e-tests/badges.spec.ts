import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('link', { name: 'Quests' }).click();
  await page.getByRole('tab', { name: 'Badges' }).click();
  await page.getByRole('button', { name: 'Create badge' }).click();
  await page.getByRole('textbox', { name: 'Title' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('test badge');
  await page.getByRole('textbox', { name: 'Title' }).press('Tab');
  await page.getByRole('textbox', { name: 'Description' }).fill('test badge');
  await page.getByRole('textbox', { name: 'Description' }).press('Tab');
  await page.getByRole('button', { name: 'User', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Team' }).press('Tab');
  await page.getByRole('textbox', { name: 'XP reward' }).fill('200');
  await page.getByRole('textbox', { name: 'XP reward' }).press('Tab');
  await page
    .getByRole('button', { name: 'Select a user quest Quest for' })
    .click();
  await page.getByRole('option', { name: 'Merge a PR', exact: true }).click();
  await page
    .getByRole('button', { name: 'Merge a PR Quest for criterion 1' })
    .click();
  await page
    .getByLabel('Merge a PR', { exact: true })
    .getByText('Merge a PR')
    .click();
  await page.getByRole('textbox', { name: 'Count' }).click();
  await page.getByRole('textbox', { name: 'Count' }).fill('12');
  await page
    .getByLabel('Create badge')
    .getByRole('button', { name: 'Create badge' })
    .click();
  await expect(
    page
      .locator('div')
      .filter({ hasText: /^test badgetest badgeUser1 requirements$/ })
      .first(),
  ).toBeVisible();
  await page
    .getByRole('gridcell', { name: '200 XP Awarded when earned' })
    .click();
  await page
    .getByRole('gridcell', { name: 'requirements Merge a PR x12' })
    .click();
  await page
    .getByLabel('test badgetest badgeUser1')
    .getByRole('gridcell', { name: 'Active' })
    .click();
  await page.getByRole('button', { name: 'Preview other view' }).click();
  await expect(
    page
      .locator('div')
      .filter({
        hasText: /^test badgetest badgeUserlinusandersson02Criteria progress$/,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole('gridcell', { name: '200 XP Awarded when earned' })
    .click();
  await page
    .getByLabel('test badgetest')
    .getByRole('gridcell', { name: 'In progress 0/1 requirements' })
    .click();
  await page
    .getByLabel('test badgetest')
    .getByRole('gridcell', { name: 'Not earned In progress' })
    .click();
});
