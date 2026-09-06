import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_IDS } from '../packages/contracts/dist/index.js';

const validMission = {
  contractVersion: '1.0.0',
  id: 'mission-runtime-1',
  title: 'Runtime mission',
  objective: 'Prove runtime schema validation',
  outcomes: [{ id: 'outcome-1', description: 'Validated', successCriteria: ['schema accepted'] }],
  status: 'proposed',
  createdAt: '2026-09-06T00:00:00Z'
};

test('runtime validates normative contract documents', async () => {
  const runtime = await import('../packages/runtime/dist/index.js');
  assert.deepEqual(runtime.validateContract(SCHEMA_IDS.mission, validMission), validMission);

  const malformed = { ...validMission, outcomes: [] };
  assert.throws(
    () => runtime.validateContract(SCHEMA_IDS.mission, malformed),
    error => error?.code === 'SCHEMA_INVALID'
  );
});
