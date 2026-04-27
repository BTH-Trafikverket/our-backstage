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

function resolveConnectionString() {
  if (process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING) {
    return process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING;
  }

  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD ?? '';
  const adminDatabase =
    process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_ADMIN_DB?.trim() ||
    'postgres';

  if (!host || !port || !user) {
    throw new Error(
      'Missing local Postgres test settings. Set DB_HOST, DB_PORT, DB_USER, and DB_PASSWORD in your environment or .env.local.',
    );
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${encodeURIComponent(adminDatabase)}`;
}

async function verifyPostgresAccess(connectionString) {
  const client = new Client({ connectionString });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT current_user AS username, rolsuper, rolcreatedb
      FROM pg_roles
      WHERE rolname = current_user
    `);

    const row = result.rows[0];

    if (!row) {
      throw new Error('Could not resolve the current Postgres role.');
    }

    if (!row.rolsuper && !row.rolcreatedb) {
      throw new Error(
        `Postgres user "${row.username}" needs CREATEDB or superuser privileges for backend integration tests.`,
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

function runBackendTests(connectionString) {
  process.env.BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING =
    connectionString;

  const testArgs = [
    'workspace',
    '@internal/gamification-backend',
    'test',
    '--watch=false',
    ...process.argv.slice(2),
  ];

  if (
    !testArgs.some(
      arg => arg === '-w' || arg.startsWith('--maxWorkers'),
    )
  ) {
    testArgs.push('--maxWorkers=4');
  }

  const child = spawn(
    process.execPath,
    [yarnPath, ...testArgs],
    {
      cwd: repoRoot,
      env: process.env,
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
  const connectionString = resolveConnectionString();
  await verifyPostgresAccess(connectionString);
  runBackendTests(connectionString);
} catch (error) {
  console.error('Local Postgres is not ready for backend integration tests.');
  console.error(
    'Expected a reachable Postgres server from .env.local or BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING.',
  );
  console.error(error);
  process.exit(1);
}
