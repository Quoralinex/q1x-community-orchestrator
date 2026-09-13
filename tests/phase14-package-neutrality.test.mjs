import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  evaluateRuntimeEquivalence,
  isCompletionWiringOnlyPackageChange,
  runtimeEquivalenceBetween,
} from '../scripts/phase14/runtime-equivalence.mjs';

const before = {
  name: 'q1x-community-orchestrator',
  scripts: {
    start: 'node packages/runtime/dist/service.js',
    test: 'node --test tests/schema-contracts.test.mjs',
    check: 'npm run build && npm run verify:phase14',
    'verify:phase14': 'node scripts/phase14/verify-completion.mjs',
  },
};

const packageDocument = ({ nodeTypes = '^24.0.0', zod = '4.5.4' } = {}) => ({
  name: 'q1x-community-orchestrator',
  version: '0.0.0',
  private: true,
  scripts: structuredClone(before.scripts),
  devDependencies: {
    '@types/node': nodeTypes,
    zod,
  },
});

const lockDocument = ({
  nodeTypes = '^24.0.0',
  nodeVersion = '24.13.3',
  nodeDependencies = { 'undici-types': '~7.18.0' },
  zod = '4.5.4',
} = {}) => ({
  name: 'q1x-community-orchestrator',
  version: '0.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'q1x-community-orchestrator',
      version: '0.0.0',
      devDependencies: {
        '@types/node': nodeTypes,
        zod,
      },
    },
    'node_modules/@types/node': {
      version: nodeVersion,
      resolved: `https://registry.npmjs.org/@types/node/-/node-${nodeVersion}.tgz`,
      integrity: `sha512-node-${nodeVersion}`,
      dev: true,
      license: 'MIT',
      dependencies: nodeDependencies,
    },
    'node_modules/zod': {
      version: zod,
      resolved: `https://registry.npmjs.org/zod/-/zod-${zod}.tgz`,
      integrity: `sha512-zod-${zod}`,
      license: 'MIT',
    },
  },
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function runtimeEquivalenceFor({ beforePackage, afterPackage, beforeLock, afterLock }) {
  const root = await mkdtemp(join(tmpdir(), 'q1x-phase14-node-types-'));
  try {
    git(root, 'init');
    git(root, 'config', 'user.name', 'Q1X Tests');
    git(root, 'config', 'user.email', 'q1x-tests@example.invalid');
    await writeFile(join(root, 'package.json'), `${JSON.stringify(beforePackage, null, 2)}\n`);
    await writeFile(join(root, 'package-lock.json'), `${JSON.stringify(beforeLock, null, 2)}\n`);
    git(root, 'add', 'package.json', 'package-lock.json');
    git(root, 'commit', '-m', 'before');
    const fromSha = git(root, 'rev-parse', 'HEAD');

    await writeFile(join(root, 'package.json'), `${JSON.stringify(afterPackage, null, 2)}\n`);
    await writeFile(join(root, 'package-lock.json'), `${JSON.stringify(afterLock, null, 2)}\n`);
    git(root, 'add', 'package.json', 'package-lock.json');
    git(root, 'commit', '-m', 'after');
    const toSha = git(root, 'rev-parse', 'HEAD');
    return runtimeEquivalenceBetween({ root, fromSha, toSha });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('Phase 14 documentation regression wiring is runtime neutral', () => {
  const after = structuredClone(before);
  after.scripts.test += ' tests/phase14-docs.test.mjs';
  assert.equal(isCompletionWiringOnlyPackageChange(before, after), true);
});

test('runtime-affecting package script changes remain invalidating', () => {
  const after = structuredClone(before);
  after.scripts.start = 'node packages/runtime/dist/other-service.js';
  assert.equal(isCompletionWiringOnlyPackageChange(before, after), false);
});

test('Phase 14 runtime-equivalence verifier changes are governance-only', () => {
  const result = evaluateRuntimeEquivalence(['scripts/phase14/runtime-equivalence.mjs']);
  assert.equal(result.equivalent, true);
  assert.deepEqual(result.invalidatingPaths, []);
});

test('Dependabot policy changes are governance-only for Phase 14 runtime equivalence', () => {
  const result = evaluateRuntimeEquivalence(['.github/dependabot.yml']);
  assert.equal(result.equivalent, true);
  assert.deepEqual(result.invalidatingPaths, []);
});

test('same-major Node 24 typings package and lockfile update is runtime neutral', async () => {
  const result = await runtimeEquivalenceFor({
    beforePackage: packageDocument(),
    afterPackage: packageDocument({ nodeTypes: '^24.13.4' }),
    beforeLock: lockDocument(),
    afterLock: lockDocument({ nodeTypes: '^24.13.4', nodeVersion: '24.13.4' }),
  });
  assert.equal(result.equivalent, true);
  assert.deepEqual(result.invalidatingPaths, []);
  assert.deepEqual(result.neutralizedPaths, ['package-lock.json', 'package.json']);
});

test('Node typings package and lockfile ranges must remain paired', async () => {
  const result = await runtimeEquivalenceFor({
    beforePackage: packageDocument(),
    afterPackage: packageDocument({ nodeTypes: '^24.13.4' }),
    beforeLock: lockDocument(),
    afterLock: lockDocument({ nodeTypes: '^24.12.0', nodeVersion: '24.13.4' }),
  });
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.invalidatingPaths, ['package-lock.json', 'package.json']);
});

test('Node typings installed version must satisfy the paired declared range', async () => {
  const result = await runtimeEquivalenceFor({
    beforePackage: packageDocument(),
    afterPackage: packageDocument({ nodeTypes: '^24.13.4' }),
    beforeLock: lockDocument(),
    afterLock: lockDocument({ nodeTypes: '^24.13.4', nodeVersion: '24.12.0' }),
  });
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.invalidatingPaths, ['package-lock.json', 'package.json']);
});

test('Node typings major-version jump remains runtime invalidating', async () => {
  const result = await runtimeEquivalenceFor({
    beforePackage: packageDocument(),
    afterPackage: packageDocument({ nodeTypes: '^26.5.1' }),
    beforeLock: lockDocument(),
    afterLock: lockDocument({ nodeTypes: '^26.5.1', nodeVersion: '26.5.1' }),
  });
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.invalidatingPaths, ['package-lock.json', 'package.json']);
});

test('runtime dependency drift remains invalidating alongside Node typings maintenance', async () => {
  const result = await runtimeEquivalenceFor({
    beforePackage: packageDocument(),
    afterPackage: packageDocument({ nodeTypes: '^24.13.4', zod: '4.6.1' }),
    beforeLock: lockDocument(),
    afterLock: lockDocument({ nodeTypes: '^24.13.4', nodeVersion: '24.13.4', zod: '4.6.1' }),
  });
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.invalidatingPaths, ['package-lock.json', 'package.json']);
});

test('Node typings dependency-graph drift remains runtime invalidating', async () => {
  const result = await runtimeEquivalenceFor({
    beforePackage: packageDocument(),
    afterPackage: packageDocument({ nodeTypes: '^24.13.4' }),
    beforeLock: lockDocument(),
    afterLock: lockDocument({
      nodeTypes: '^24.13.4',
      nodeVersion: '24.13.4',
      nodeDependencies: { 'undici-types': '~8.9.0' },
    }),
  });
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.invalidatingPaths, ['package-lock.json', 'package.json']);
});
