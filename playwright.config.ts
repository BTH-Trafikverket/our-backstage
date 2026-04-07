/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig, type Project } from '@playwright/test';
import { generateProjects } from '@backstage/e2e-test-utils/playwright';

const baseURL = process.env.PLAYWRIGHT_URL;
const configuredWorkers = Number.parseInt(
  process.env.PLAYWRIGHT_WORKERS ?? '',
  10,
);
const workers =
  Number.isFinite(configuredWorkers) && configuredWorkers > 0
    ? configuredWorkers
    : process.env.CI
    ? 2
    : undefined;

if (!baseURL) {
  throw new Error('PLAYWRIGHT_URL must be set for Docker E2E runs');
}

const projects: Project[] = (generateProjects() ?? []).map(project => ({
  ...project,
  use: {
    ...(project?.use ?? {}),
    browserName: 'chromium',
    channel: 'chromium',
  },
}));

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: 60_000,

  expect: {
    timeout: 5_000,
  },

  webServer: [],

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  reporter: [['html', { open: 'never', outputFolder: 'tmp/e2e/report' }]],

  workers,

  use: {
    actionTimeout: 0,
    baseURL,
    browserName: 'chromium',
    channel: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  outputDir: 'tmp/e2e/results',

  projects,
});
