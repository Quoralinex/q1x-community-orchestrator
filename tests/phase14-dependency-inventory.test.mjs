import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('Phase 14 dependency inventory is deterministic licensed production evidence', async () => {
  const { buildDependencyInventory } = await import('../scripts/phase14/dependency-inventory.mjs');
  const inventory = await buildDependencyInventory(root);
  assert.equal(inventory.schema, 'q1x.phase14-dependency-inventory.v1');
  assert.match(inventory.lockfileSha256, /^[0-9a-f]{64}$/);
  assert.equal(inventory.publicPackages.length, 8);
  assert.ok(inventory.publicPackages.every(item => item.license === 'SEE LICENSE IN LICENSE'));
  assert.ok(inventory.packages.length > 0);
  assert.ok(inventory.packages.every(item => item.name && item.version && item.license));
  assert.ok(inventory.packages.every(item => item.relationship === 'direct' || item.relationship === 'transitive'));
  assert.deepEqual(
    inventory.packages.map(item => `${item.name}@${item.version}`),
    [...inventory.packages].map(item => `${item.name}@${item.version}`).sort(),
  );
  const names = new Set(inventory.packages.map(item => item.name));
  assert.ok(names.has('ajv'));
  assert.ok(names.has('playwright-core'));
  assert.equal(inventory.externalProviderCalls, 0);
});

test('Phase 14 dependency inventory output is byte-stable for the same lockfile', async () => {
  const { buildDependencyInventory } = await import('../scripts/phase14/dependency-inventory.mjs');
  const first = await buildDependencyInventory(root);
  const second = await buildDependencyInventory(root);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.doesNotMatch(JSON.stringify(first), /\/Users\/|generatedAt|createdAt/);
});
