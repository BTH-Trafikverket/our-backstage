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

function envValue(name) {
  return process.env[name]?.trim() || undefined;
}

function resolveBackendReadinessUrl(backendBaseUrl) {
  if (!backendBaseUrl) {
    return undefined;
  }

  return new URL('/.backstage/health/v1/readiness', backendBaseUrl).toString();
}

function createTarget(name, appUrl, backendBaseUrl) {
  return {
    name,
    appUrl,
    backendBaseUrl,
    backendReadinessUrl: resolveBackendReadinessUrl(backendBaseUrl),
  };
}

function resolveTargets() {
  const explicitAppUrl = envValue('PLAYWRIGHT_URL');
  const explicitBackendBaseUrl = envValue('PLAYWRIGHT_BACKEND_URL');
  const devAppUrl = envValue('APP_BASE_URL') || 'http://localhost:3000';
  const devBackendBaseUrl =
    envValue('BACKEND_BASE_URL') || 'http://localhost:7007';

  if (explicitAppUrl || explicitBackendBaseUrl) {
    return [
      createTarget(
        'configured Playwright app',
        explicitAppUrl || devAppUrl,
        explicitBackendBaseUrl || devBackendBaseUrl,
      ),
    ];
  }

  const targets = [
    createTarget(
      'dedicated e2e app',
      envValue('APP_BASE_URL_E2E') || 'http://localhost:3001',
      envValue('BACKEND_BASE_URL_E2E') || 'http://localhost:7008',
    ),
    createTarget('local dev app', devAppUrl, devBackendBaseUrl),
  ];

  return targets.filter(
    (target, index) =>
      targets.findIndex(
        other =>
          other.appUrl === target.appUrl &&
          other.backendBaseUrl === target.backendBaseUrl,
      ) === index,
  );
}

function describeTarget(target) {
  return `${target.name} at ${target.appUrl}${
    target.backendReadinessUrl ? ` and ${target.backendReadinessUrl}` : ''
  }`;
}

async function fetchOk(url) {
  const response = await fetch(url);
  return response.ok;
}

async function isTargetReady(target) {
  const checks = [fetchOk(target.appUrl)];

  if (target.backendReadinessUrl) {
    checks.push(fetchOk(target.backendReadinessUrl));
  }

  const results = await Promise.all(checks);
  return results.every(Boolean);
}

async function waitForLocalApp() {
  const targets = resolveTargets();
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    for (const target of targets) {
      try {
        if (await isTargetReady(target)) {
          return target;
        }

        lastError = new Error(`${target.name} is still starting.`);
      } catch (error) {
        lastError = error;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Timed out waiting for a local E2E app. Checked ${targets
      .map(describeTarget)
      .join(
        ', ',
      )}. Start the isolated e2e app with "yarn start:e2e", start the normal dev app with "yarn start", or point Playwright at another running app with PLAYWRIGHT_URL and PLAYWRIGHT_BACKEND_URL.${
      lastError ? ` Last error: ${lastError}` : ''
    }`,
  );
}

function runPlaywright(target) {
  const env = {
    ...process.env,
    PLAYWRIGHT_URL: target.appUrl,
    PLAYWRIGHT_BACKEND_URL: target.backendBaseUrl,
  };

  delete env.NO_COLOR;

  const child = spawn(
    process.execPath,
    [yarnPath, 'test:e2e:run', ...process.argv.slice(2)],
    {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    },
  );

  child.on('exit', code => {
    process.exit(code ?? 1);
  });

  child.on('error', error => {
    console.error(error);
    process.exit(1);
  });
}

try {
  const target = await waitForLocalApp();
  console.log(`Using ${describeTarget(target)}`);
  runPlaywright(target);
} catch (error) {
  console.error('Local E2E app is not ready.');
  console.error(error);
  process.exit(1);
}
