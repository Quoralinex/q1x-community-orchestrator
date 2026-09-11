import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_SCENARIOS,
  runResilience,
} from '../scripts/phase13/run-resilience.mjs';

const TEST_SHA = 'a'.repeat(40);

test('resilience runner emits every required scenario with exact source identity', async () => {
  const report = await runResilience({ sourceSha: TEST_SHA });
  assert.equal(report.schema, 'q1x.phase13-resilience-evidence.v1');
  assert.equal(report.sourceSha, TEST_SHA);
  assert.deepEqual(
    new Set(report.scenarios.map(item => item.id)),
    new Set(REQUIRED_SCENARIOS),
  );
  assert.ok(report.scenarios.every(item => item.state === 'passed'));
});
test('every resilience scenario records bounded deterministic evidence', async () => {
  const report = await runResilience({ sourceSha: TEST_SHA });
  for (const scenario of report.scenarios) {
    assert.equal(typeof scenario.expectedErrorCode, 'string');
    assert.equal(typeof scenario.observedErrorCode, 'string');
    assert.equal(typeof scenario.durableStateBefore, 'string');
    assert.equal(typeof scenario.durableStateAfter, 'string');
    assert.equal(typeof scenario.restartState, 'string');
    assert.equal(Number.isFinite(scenario.durationMs), true);
    assert.ok(scenario.durationMs >= 0);
    assert.equal(scenario.observedErrorCode, scenario.expectedErrorCode);
  }
});
