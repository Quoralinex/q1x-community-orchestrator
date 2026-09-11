import assert from 'node:assert/strict';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const TEST_SHA256 = 'a'.repeat(64);

async function surfaceModule() {
  return import('../scripts/phase14/public-surface.mjs');
}

test('Phase 14 collects the deterministic intended stable public surface', async () => {
  const { collectPublicSurface } = await surfaceModule();
  const first = await collectPublicSurface(root);
  const second = await collectPublicSurface(root);

  assert.deepEqual(first, second);
  assert.equal(first.schema, 'q1x.phase14-public-surface.v1');
  assert.equal(first.contracts.family, 'v1');
  assert.ok(first.contracts.schemas.length >= 30);
  assert.ok(first.contracts.schemas.every(item => /^[0-9a-f]{64}$/.test(item.sha256)));
  assert.ok(first.contracts.schemas.every(item => item.id.startsWith('urn:q1x:community:contracts:v1:')));
  assert.equal(first.packages.length, 8);
  assert.ok(first.packages.every(item => item.name.startsWith('@quoralinex/q1x-community-')));
  assert.ok(first.typeExports.length === 8);
  assert.ok(first.typeExports.every(item => item.exports.length > 0));
  assert.equal(first.cli.outputContract.errorSchema, 'q1x.cli-error.v1');
  assert.equal(first.cli.outputContract.successExitCode, 0);
  assert.equal(first.cli.outputContract.failureExitCode, 1);
  assert.ok(first.cli.commands.some(item => item.usage === 'q1x help'));
  assert.ok(first.connectors.some(item => item.id === 'mcp.stdio'));
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /\/Users\//);
  assert.equal(Object.hasOwn(first, 'generatedAt'), false);
  assert.equal(Object.hasOwn(first, 'createdAt'), false);
});

test('Phase 14 public-surface comparison fails closed on removals and incompatible drift', async () => {
  const { collectPublicSurface, comparePublicSurface } = await surfaceModule();
  const baseline = await collectPublicSurface(root);
  assert.equal(comparePublicSurface(baseline, baseline).ok, true);

  const missingCli = structuredClone(baseline);
  missingCli.cli.commands = missingCli.cli.commands.filter(item => item.usage !== 'q1x help');
  assert.equal(comparePublicSurface(baseline, missingCli).ok, false);

  const changedSchema = structuredClone(baseline);
  changedSchema.contracts.schemas[0].sha256 = TEST_SHA256;
  assert.equal(comparePublicSurface(baseline, changedSchema).ok, false);

  const changedType = structuredClone(baseline);
  changedType.typeExports[0].exports[0].signature += ' incompatible';
  assert.equal(comparePublicSurface(baseline, changedType).ok, false);

  const missingConnector = structuredClone(baseline);
  missingConnector.connectors = missingConnector.connectors.slice(1);
  assert.equal(comparePublicSurface(baseline, missingConnector).ok, false);
});

test('Phase 14 public-surface comparison permits additive pre-RC entries', async () => {
  const { collectPublicSurface, comparePublicSurface } = await surfaceModule();
  const baseline = await collectPublicSurface(root);
  const additive = structuredClone(baseline);
  additive.cli.commands.push({ usage: 'q1x future-safe-command', purpose: 'Additive pre-RC command.' });
  additive.cli.commands.sort((a, b) => a.usage.localeCompare(b.usage));
  additive.typeExports[0].exports.push({ name: 'FutureSafeType', signature: 'export interface FutureSafeType { ok: true; }' });
  additive.typeExports[0].exports.sort((a, b) => a.name.localeCompare(b.name));
  additive.connectors.push({ id: 'future.safe', category: 'cli', protocol: 'future.safe', requirementCommands: [], environmentKeys: [], profile: { kind: 'future.safe', platform: null, template: null } });
  additive.connectors.sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(comparePublicSurface(baseline, additive).ok, true);
});
