#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const yarnPath = path.join(repoRoot, '.yarn/releases/yarn-4.4.1.cjs');
const timeoutMs = Number.parseInt(
  process.env.E2E_READY_TIMEOUT_MS ?? '30000',
  10,
);
const appUrl =
  process.env.PLAYWRIGHT_URL?.trim() ||
  process.env.APP_BASE_URL?.trim() ||
  process.env.APP_BASE_URL_E2E?.trim() ||
  'http://localhost:3000';
const backendBaseUrl =
  process.env.PLAYWRIGHT_BACKEND_URL?.trim() ||
  process.env.BACKEND_BASE_URL?.trim() ||
  process.env.BACKEND_BASE_URL_E2E?.trim() ||
  'http://localhost:7007';

function resolveBackendReadinessUrl() {
  if (!backendBaseUrl) {
    return undefined;
  }

  return new URL('/.backstage/health/v1/readiness', backendBaseUrl).toString();
}

async function fetchOk(url) {
  const response = await fetch(url);
  return response.ok;
}

async function waitForLocalApp() {
  const backendReadinessUrl = resolveBackendReadinessUrl();
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const checks = [fetchOk(appUrl)];

      if (backendReadinessUrl) {
        checks.push(fetchOk(backendReadinessUrl));
      }

      const results = await Promise.all(checks);

      if (results.every(Boolean)) {
        return;
      }

      lastError = new Error('Local Backstage is still starting.');
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Timed out waiting for the local E2E app at ${appUrl}${
      backendReadinessUrl ? ` and ${backendReadinessUrl}` : ''
    }. Start your app with "yarn start", "docker compose up", or point Playwright at another running app with PLAYWRIGHT_URL.${
      lastError ? ` Last error: ${lastError}` : ''
    }`,
  );
}

function runPlaywright() {
  process.env.PLAYWRIGHT_URL = appUrl;

  const child = spawn(process.execPath, [yarnPath, 'test:e2e:run'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', code => {
    process.exit(code ?? 1);
  });

  child.on('error', error => {
    console.error(error);
    process.exit(1);
  });
}

try {
  await waitForLocalApp();
  runPlaywright();
} catch (error) {
  console.error('Local E2E app is not ready.');
  console.error(error);
  process.exit(1);
}
