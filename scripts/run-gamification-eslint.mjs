#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const eslintBin = path.join(
  path.dirname(require.resolve('eslint/package.json')),
  'bin',
  'eslint.js',
);
const pluginRoots = ['plugins/gamification', 'plugins/gamification-backend'];

const rawArgs = process.argv.slice(2);
const shouldFix = rawArgs.includes('--fix');
const candidateTargets = rawArgs.filter(arg => arg !== '--fix');

function normalizeTarget(target) {
  return target.split(path.sep).join('/');
}

function isPluginTarget(target) {
  return pluginRoots.some(
    root => target === root || target.startsWith(`${root}/`),
  );
}

const providedTargets = candidateTargets
  .map(normalizeTarget)
  .filter(target => isPluginTarget(target))
  .filter(target => fs.existsSync(path.resolve(repoRoot, target)));

if (candidateTargets.length > 0 && providedTargets.length === 0) {
  process.exit(0);
}

const targets = providedTargets.length > 0 ? providedTargets : pluginRoots;

const result = spawnSync(
  'node',
  [
    eslintBin,
    '--cache',
    '--cache-location',
    '.cache/eslint-gamification',
    '--max-warnings',
    '0',
    ...(shouldFix ? ['--fix'] : []),
    ...targets,
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
