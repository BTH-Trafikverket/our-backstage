import fs from 'node:fs/promises';
import path from 'node:path';
import {
  chromium,
  expect,
  type BrowserContextOptions,
  type FullConfig,
} from '@playwright/test';
import { guestStorageStatePath } from './plugins/gamification/e2e-tests/guestAuth';

function resolveBaseUrl(config: FullConfig): string {
  const baseUrl = config.projects.find(project => project.use?.baseURL)?.use
    ?.baseURL;

  if (typeof baseUrl !== 'string' || !baseUrl) {
    throw new Error('Playwright baseURL must be configured for guest auth');
  }

  return baseUrl;
}

function resolveContextOptions(config: FullConfig): BrowserContextOptions {
  const projectUse = config.projects.find(project => project.use?.baseURL)?.use;

  return {
    baseURL: typeof projectUse?.baseURL === 'string' ? projectUse.baseURL : '',
    storageState: undefined,
  };
}

export default async function globalSetup(config: FullConfig) {
  const baseUrl = resolveBaseUrl(config);

  await fs.mkdir(path.dirname(guestStorageStatePath), {
    recursive: true,
  });

  const browser = await chromium.launch({ channel: 'chromium' });

  try {
    const context = await browser.newContext(resolveContextOptions(config));
    const page = await context.newPage();

    await page.goto(baseUrl);
    await expect(page.getByText('Guest', { exact: true })).toBeVisible();

    const enterButton = page.getByRole('button', { name: 'Enter' });
    await expect(enterButton).toBeVisible();
    await enterButton.click();

    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole('link', { name: 'Quests' })).toBeVisible();
    await context.storageState({ path: guestStorageStatePath });
    await context.close();
  } finally {
    await browser.close();
  }
}
