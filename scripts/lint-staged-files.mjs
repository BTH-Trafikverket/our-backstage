#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const prettierBin = path.join(
  path.dirname(require.resolve('prettier/package.json')),
  'bin-prettier.js',
);
const pluginRoots = ['plugins/gamification', 'plugins/gamification-backend'];
const eslintExtensions = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
]);
const prettierExtensions = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.md',
  '.yaml',
  '.yml',
]);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: repoRoot,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const stagedOutput = execFileSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
);

const stagedFiles = stagedOutput
  .split('\0')
  .filter(Boolean)
  .map(file => file.split(path.sep).join('/'))
  .filter(file =>
    pluginRoots.some(root => file === root || file.startsWith(`${root}/`)),
  )
  .filter(file => fs.existsSync(path.resolve(repoRoot, file)));

if (stagedFiles.length === 0) {
  process.exit(0);
}

const eslintFiles = stagedFiles.filter(file =>
  eslintExtensions.has(path.extname(file)),
);
const prettierFiles = stagedFiles.filter(file =>
  prettierExtensions.has(path.extname(file)),
);
const touchedFiles = Array.from(new Set([...eslintFiles, ...prettierFiles]));

if (prettierFiles.length > 0) {
  run('node', [prettierBin, '--write', ...prettierFiles]);
  run('node', [prettierBin, '--check', ...prettierFiles]);
}

if (eslintFiles.length > 0) {
  run('node', [
    './scripts/run-gamification-eslint.mjs',
    '--fix',
    ...eslintFiles,
  ]);
}

if (touchedFiles.length > 0) {
  run('git', ['add', '--', ...touchedFiles]);
}
