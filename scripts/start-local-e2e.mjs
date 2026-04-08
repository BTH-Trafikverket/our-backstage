#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const yarnPath = path.join(repoRoot, '.yarn/releases/yarn-4.4.1.cjs');

function resolveE2eEnv() {
  const appBaseUrl =
    process.env.APP_BASE_URL_E2E?.trim() || 'http://localhost:3001';
  const backendBaseUrl =
    process.env.BACKEND_BASE_URL_E2E?.trim() || 'http://localhost:7008';

  return {
    ...process.env,
    BACKSTAGE_E2E_MODE: 'true',
    APP_BASE_URL: appBaseUrl,
    BACKEND_BASE_URL: backendBaseUrl,
    BACKEND_PORT: process.env.BACKEND_PORT_E2E?.trim() || '7008',
    CORS_ORIGIN: process.env.CORS_ORIGIN_E2E?.trim() || appBaseUrl,
    DB_HOST:
      process.env.DB_HOST_E2E?.trim() || process.env.DB_HOST || 'localhost',
    DB_PORT: process.env.DB_PORT_E2E?.trim() || process.env.DB_PORT || '5432',
    DB_USER: process.env.DB_USER_E2E?.trim() || process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD_E2E ?? process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME_E2E?.trim() || 'backstage_e2e',
  };
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function ensureDatabaseExists(env) {
  if (!env.DB_HOST || !env.DB_PORT || !env.DB_USER) {
    throw new Error(
      'Missing DB_HOST, DB_PORT, or DB_USER for the local E2E database.',
    );
  }

  const adminDatabase =
    process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_ADMIN_DB?.trim() ||
    'postgres';
  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: adminDatabase,
  });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [env.DB_NAME],
    );

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(env.DB_NAME)}`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

try {
  const env = resolveE2eEnv();
  await ensureDatabaseExists(env);

  const child = spawn(
    process.execPath,
    [
      yarnPath,
      'backstage-cli',
      'repo',
      'start',
      '--config',
      path.join(repoRoot, 'app-config.e2e.yaml'),
    ],
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
} catch (error) {
  console.error('Local E2E database setup failed.');
  console.error(error);
  process.exit(1);
}
