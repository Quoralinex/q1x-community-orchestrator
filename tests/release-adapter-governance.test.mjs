import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assertReleaseIdentity, readReleaseIdentity } from '../scripts/release/release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('public alpha governs exactly four packages in dependency order', async () => {
  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  assert.deepEqual(identity.packages.map(item => item.name), [
    '@quoralinex/q1x-community-contracts',
    '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-adapter-sdk',
    '@quoralinex/q1x-community-runtime',
  ]);
  const adapter = identity.packages[2];
  assert.equal(adapter.version, '0.1.0-alpha.1');
  assert.equal(adapter.dependencies['@quoralinex/q1x-community-sdk'], '0.1.0-alpha.1');
  assert.equal(identity.packages[3].dependencies['@quoralinex/q1x-community-adapter-sdk'], '0.1.0-alpha.1');
});

test('public alpha workflow publishes adapter SDK after core SDK and before runtime', async () => {
  const workflow = await readFile(join(root, '.github/workflows/public-alpha.yml'), 'utf8');
  const contracts = workflow.indexOf('quoralinex-q1x-community-contracts-0.1.0-alpha.1.tgz');
  const sdk = workflow.indexOf('quoralinex-q1x-community-sdk-0.1.0-alpha.1.tgz');
  const adapter = workflow.indexOf('quoralinex-q1x-community-adapter-sdk-0.1.0-alpha.1.tgz');
  const runtime = workflow.indexOf('quoralinex-q1x-community-runtime-0.1.0-alpha.1.tgz');
  assert.ok(contracts >= 0 && sdk > contracts && adapter > sdk && runtime > adapter);
});
