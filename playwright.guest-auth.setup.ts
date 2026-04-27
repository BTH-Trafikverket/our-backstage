import fs from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig, StorageState } from '@playwright/test';
import { guestStorageStatePath } from './plugins/gamification/e2e-tests/guestAuth';

function resolveBaseUrl(config: FullConfig): string {
  const baseUrl = config.projects.find(project => project.use?.baseURL)?.use
    ?.baseURL;

  if (typeof baseUrl !== 'string' || !baseUrl) {
    throw new Error('Playwright baseURL must be configured for guest auth');
  }

  return baseUrl;
}

export default async function globalSetup(config: FullConfig) {
  const baseUrl = resolveBaseUrl(config);
  const storageState: StorageState = {
    cookies: [],
    origins: [
      {
        origin: new URL(baseUrl).origin,
        localStorage: [
          {
            name: '@backstage/core:SignInPage:provider',
            value: 'guest',
          },
          {
            name: 'language',
            value: 'en',
          },
          {
            name: 'sidebarPinState',
            value: 'true',
          },
        ],
      },
    ],
  };

  await fs.mkdir(path.dirname(guestStorageStatePath), {
    recursive: true,
  });
  await fs.writeFile(guestStorageStatePath, JSON.stringify(storageState));
}
