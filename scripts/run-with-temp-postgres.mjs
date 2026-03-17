#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const command = process.argv.slice(2);

if (command.length === 0) {
  console.error(
    'Usage: node ./scripts/run-with-temp-postgres.mjs <command> [args...]',
  );
  process.exit(1);
}

const image = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:18';
const username = process.env.TEST_POSTGRES_USER ?? 'postgres';
const password = process.env.TEST_POSTGRES_PASSWORD ?? 'postgres';
const database = process.env.TEST_POSTGRES_DB ?? 'postgres';
const containerName = `gamification-test-postgres-${randomUUID()}`;

let containerId;
let child;

function run(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(
      output.trim() ||
        `${commandName} ${args.join(' ')} failed with code ${result.status}`,
    );
  }

  return result.stdout.trim();
}

function getMappedPort(id) {
  const output = run('docker', ['port', id, '5432/tcp']);
  const localhostMatch = output.match(/127\.0\.0\.1:(\d+)/);
  const genericMatch = output.match(/:(\d+)\s*$/m);
  const value = localhostMatch?.[1] ?? genericMatch?.[1];

  if (!value) {
    throw new Error(`Could not determine mapped Postgres port from: ${output}`);
  }

  return Number(value);
}

async function waitForStablePostgres(host, port) {
  const timeoutMs = 60_000;
  const start = Date.now();
  let consecutiveSuccesses = 0;
  let lastError;

  while (Date.now() - start < timeoutMs) {
    let client;

    try {
      client = new Client({
        host,
        port,
        user: username,
        password,
        database,
      });

      await client.connect();
      const result = await client.query('SELECT 1');

      if (result.rows[0]?.['?column?'] === 1) {
        consecutiveSuccesses += 1;
        if (consecutiveSuccesses >= 2) {
          return;
        }
      } else {
        consecutiveSuccesses = 0;
        lastError = new Error('Unexpected Postgres readiness query result');
      }
    } catch (error) {
      consecutiveSuccesses = 0;
      lastError = error;
    } finally {
      await client?.end().catch(() => undefined);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for Postgres readiness${
      lastError ? `: ${lastError}` : ''
    }`,
  );
}

async function stopContainer() {
  if (!containerId) {
    return;
  }

  spawnSync('docker', ['stop', containerId], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  containerId = undefined;
}

async function shutdownWithSignal(signal) {
  if (child && child.exitCode === null) {
    child.kill(signal);
  }

  await stopContainer();
  process.exit(130);
}

process.on('SIGINT', () => {
  void shutdownWithSignal('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdownWithSignal('SIGTERM');
});

try {
  console.log(`Starting temporary Postgres test container with ${image}...`);

  containerId = run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--tmpfs',
    '/var/lib/postgresql/data:rw',
    '--env',
    'PGDATA=/var/lib/postgresql/data',
    '--env',
    `POSTGRES_USER=${username}`,
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    '--env',
    `POSTGRES_DB=${database}`,
    '--publish',
    '127.0.0.1::5432',
    image,
  ]);

  const host = '127.0.0.1';
  const port = getMappedPort(containerId);

  await waitForStablePostgres(host, port);

  const connectionString = `postgresql://${encodeURIComponent(
    username,
  )}:${encodeURIComponent(password)}@${host}:${port}/${database}`;

  console.log(`Temporary Postgres ready at ${host}:${port}.`);

  child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING: connectionString,
      DB_HOST: host,
      DB_PORT: String(port),
      DB_USER: username,
      DB_PASSWORD: password,
      DB_NAME: database,
    },
  });

  const exitCode = await new Promise(resolve => {
    child.on('exit', code => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  await stopContainer();
  process.exit(exitCode);
} catch (error) {
  await stopContainer();
  console.error(
    'Failed to start the temporary Postgres test container. Make sure Docker is running.',
  );
  console.error(error);
  process.exit(1);
}
