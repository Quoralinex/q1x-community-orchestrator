import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateSbom } from '../scripts/release/generate-sbom.mjs';
import { verifyReproduciblePackages } from '../scripts/release/verify-reproducible-packages.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('two clean beta builds have identical unpacked inventories and digests', { timeout: 300_000 }, async () => {
  const result = await verifyReproduciblePackages({
    root,
    version: '0.2.0-beta.1',
    sourceSha: 'c'.repeat(40),
  });
  assert.equal(result.schema, 'q1x.release-reproducibility.v1');
  assert.equal(result.reproducible, true);
  assert.equal(result.packages.length, 8);
  assert.ok(result.packages.every(pkg => pkg.inventoryMatch));
  assert.ok(result.packages.every(pkg => typeof pkg.archiveByteMatch === 'boolean'));
});
test('SPDX SBOM covers every governed public package and lockfile dependency', async () => {
  const sbom = await generateSbom(root);
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.equal(sbom.dataLicense, 'CC0-1.0');
  const names = new Set(sbom.packages.map(item => item.name));
  for (const name of [
    '@quoralinex/q1x-community-contracts', '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-adapter-sdk', '@quoralinex/q1x-community-desktop-bridge-common',
    '@quoralinex/q1x-community-desktop-bridge-macos', '@quoralinex/q1x-community-desktop-bridge-windows',
    '@quoralinex/q1x-community-desktop-bridge-linux', '@quoralinex/q1x-community-runtime',
  ]) assert.equal(names.has(name), true, name);
  assert.ok(sbom.packages.length > 8);
  assert.ok(sbom.relationships.some(item => item.relationshipType === 'DEPENDS_ON'));
});

test('staged beta SBOM reports the beta identity while source manifests remain Alpha 2', async () => {
  const sbom = await generateSbom(root, { publicVersion: '0.2.0-beta.1' });
  const publicPackages = sbom.packages.filter(item => item.name.startsWith('@quoralinex/q1x-community'));
  assert.equal(publicPackages.length, 8);
  assert.equal(publicPackages.every(item => item.versionInfo === '0.2.0-beta.1'), true);
});
