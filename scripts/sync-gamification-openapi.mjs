#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourcePath = path.join(
  repoRoot,
  'plugins/gamification-backend/src/schema/openapi.yaml',
);
const catalogPath = path.join(repoRoot, 'catalog/apis/gamification-api.yaml');
const checkOnly = process.argv.includes('--check');

const source = fs.readFileSync(sourcePath, 'utf8').trimEnd();
const definition = source
  .split('\n')
  .map(line => `    ${line}`)
  .join('\n');

const expected = `# Generated from plugins/gamification-backend/src/schema/openapi.yaml by yarn gamification:openapi:sync.
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: gamification-api
  description: OpenAPI definition for the internal gamification backend plugin.
spec:
  type: openapi
  lifecycle: experimental
  owner: user:default/LinusAndersson02
  definition: |
${definition}
`;

const current = fs.existsSync(catalogPath)
  ? fs.readFileSync(catalogPath, 'utf8')
  : '';

if (checkOnly) {
  if (current !== expected) {
    console.error(
      'catalog/apis/gamification-api.yaml is out of sync with plugins/gamification-backend/src/schema/openapi.yaml',
    );
    console.error('Run: yarn gamification:openapi:sync');
    process.exit(1);
  }

  process.exit(0);
}

fs.writeFileSync(catalogPath, expected);
console.log('Synced catalog/apis/gamification-api.yaml from openapi.yaml');
