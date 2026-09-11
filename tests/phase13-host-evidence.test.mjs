import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateHostEvidence } from '../scripts/compatibility/matrix-lib.mjs';

const SHA = 'a'.repeat(40);
const base = {
  schema: 'q1x.phase13-host-evidence.v1',
  environmentTier: 'physical-host',
  os: 'macos', osVersion: '15.7', architecture: 'x64',
  sourceSha: SHA, bridgeVersion: '0.1.0-alpha.2',
  scenarioIds: ['doctor'], state: 'blocked',
  remediationNotes: ['Accessibility permission is not granted.'],
};

test('physical-host evidence accepts only sanitized bounded host facts', () => {
  assert.deepEqual(validateHostEvidence(base), { valid: true, findings: [] });
});

test('physical-host evidence rejects identity, private path and secret-bearing fields', () => {
  for (const bad of [
    { ...base, hostname: 'private-host' },
    { ...base, username: 'marc' },
    { ...base, remediationNotes: ['/Users/private/Library/state'] },
    { ...base, remediationNotes: ['token=secret-value'] },
  ]) assert.equal(validateHostEvidence(bad).valid, false);
});

test('physical-host evidence schema is fail-closed and versioned', async () => {
  const schema = JSON.parse(await readFile(new URL('../compatibility/evidence/phase13-host-evidence.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.environmentTier.const, 'physical-host');
  assert.equal(schema.properties.sourceSha.pattern, '^[0-9a-f]{40}$');
  assert.deepEqual(schema.properties.state.enum, ['pass', 'fail', 'blocked']);
});
