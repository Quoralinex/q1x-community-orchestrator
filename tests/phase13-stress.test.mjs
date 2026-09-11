import assert from 'node:assert/strict';
import test from 'node:test';
import { runStress } from '../scripts/phase13/run-stress.mjs';
import { runSoak } from '../scripts/phase13/run-soak.mjs';

const TEST_SHA = 'b'.repeat(40);

test('bounded PR stress workload satisfies the Phase 13 minimums', async () => {
  const report = await runStress({ sourceSha: TEST_SHA, maxDurationMs: 120_000 });
  assert.equal(report.schema, 'q1x.phase13-stress-evidence.v1');
  assert.equal(report.sourceSha, TEST_SHA);
  assert.ok(report.counts.documentOperations >= 1_000);
  assert.ok(report.counts.doctorCycles >= 100);
  assert.ok(report.counts.supervisionRecoveryCycles >= 50);
  assert.ok(report.counts.concurrentCliAccess >= 4);
  assert.ok(report.elapsedMs <= 120_000);
});
test('stress workload finishes with clean integrity, audit and rejection state', async () => {
  const report = await runStress({ sourceSha: TEST_SHA, maxDurationMs: 120_000 });
  assert.equal(report.sqliteIntegrity, 'ok');
  assert.equal(report.auditValid, true);
  assert.equal(report.unhandledRejections, 0);
  assert.equal(report.uncaughtExceptions, 0);
  assert.equal(report.state, 'passed');
});

test('soak runner emits bounded local-only evidence even for a zero-minute smoke pass', async () => {
  const report = await runSoak({ sourceSha: TEST_SHA, minutes: 0 });
  assert.equal(report.schema, 'q1x.phase13-soak-evidence.v1');
  assert.equal(report.sourceSha, TEST_SHA);
  assert.ok(report.iterations >= 1);
  assert.equal(report.sqliteIntegrity, 'ok');
  assert.equal(report.auditValid, true);
  assert.equal(report.externalProviderCalls, 0);
});
