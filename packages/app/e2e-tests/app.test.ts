/*
 * Copyright 2020 The Backstage Authors
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

import { test, expect, type Page } from '@playwright/test';

async function signInAsGuest(page: Page) {
  await page.goto('/');

  await expect(page.getByText('Guest', { exact: true })).toBeVisible();

  const enterButton = page.getByRole('button', { name: 'Enter' });
  await expect(enterButton).toBeVisible();
  await enterButton.click();

  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('link', { name: 'Quests' })).toBeVisible();
}

test('Guest sign-in reaches the app shell', async ({ page }) => {
  await signInAsGuest(page);
});
