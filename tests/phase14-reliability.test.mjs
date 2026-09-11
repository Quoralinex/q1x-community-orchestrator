import assert from 'node:assert/strict';
import test from 'node:test';

const TEST_SHA = 'b'.repeat(40);

async function restartModule() { return import('../scripts/phase14/run-restart-campaign.mjs'); }
async function soakModule() { return import('../scripts/phase14/run-soak.mjs'); }
async function equivalenceModule() { return import('../scripts/phase14/runtime-equivalence.mjs'); }

test('Phase 14 restart campaign exercises bounded recovery with no provider calls', async () => {
  const { runRestartCampaign } = await restartModule();
  const report = await runRestartCampaign({ sourceSha: TEST_SHA, cycles: 10 });
  assert.equal(report.schema, 'q1x.phase14-restart-evidence.v1');
  assert.equal(report.sourceSha, TEST_SHA);
  assert.equal(report.cyclesRequested, 10);
  assert.equal(report.cyclesCompleted, 10);
  assert.equal(report.sqliteIntegrity, 'ok');
  assert.equal(report.auditValid, true);
  assert.equal(report.unresolvedExternalOperations, 0);
  assert.ok(report.reconciledOperations >= 1);
  assert.ok(report.peakRss > 0);
  assert.ok(report.openHandleCount === null || report.openHandleCount >= 0);
  assert.ok(report.fileDescriptorCount === null || report.fileDescriptorCount >= 0);
  assert.equal(report.externalProviderCalls, 0);
  assert.equal(report.state, 'passed');
});

test('Phase 14 stable soak enforces six-hour acceptance but supports bounded test-only smoke', async () => {
  const { runStableSoak } = await soakModule();
  await assert.rejects(
    () => runStableSoak({ sourceSha: TEST_SHA, minutes: 359 }),
    /at least 360/i,
  );
  const smoke = await runStableSoak({ sourceSha: TEST_SHA, minutes: 0, testOnlyAllowShortRun: true });
  assert.equal(smoke.schema, 'q1x.phase14-soak-evidence.v1');
  assert.equal(smoke.requestedMinutes, 0);
  assert.ok(smoke.iterations >= 1);
  assert.equal(smoke.sqliteIntegrity, 'ok');
  assert.equal(smoke.auditValid, true);
  assert.equal(smoke.unresolvedExternalOperations, 0);
  assert.deepEqual(smoke.limitBreaches, []);
  assert.equal(smoke.externalProviderCalls, 0);
  assert.equal(smoke.state, 'passed');
});

test('Phase 14 runtime-equivalence policy accepts only explicitly neutral paths', async () => {
  const { evaluateRuntimeEquivalence } = await equivalenceModule();
  const neutral = evaluateRuntimeEquivalence([
    '.github/workflows/stable-readiness.yml',
    'docs/stable-release.md',
    'tests/phase14-docs.test.mjs',
    'compatibility/evidence/phase14-soak.json',
    'scripts/phase14/verify-completion.mjs',
  ]);
  assert.equal(neutral.equivalent, true);
  assert.deepEqual(neutral.invalidatingPaths, []);

  const invalidating = evaluateRuntimeEquivalence([
    'packages/runtime/src/runtime.ts',
    'package.json',
    'package-lock.json',
    'Dockerfile',
    'docker-compose.yml',
    'scripts/release/release-metadata.mjs',
    'scripts/phase14/run-soak.mjs',
  ]);
  assert.equal(invalidating.equivalent, false);
  assert.deepEqual(invalidating.invalidatingPaths, [
    'Dockerfile',
    'docker-compose.yml',
    'package-lock.json',
    'package.json',
    'packages/runtime/src/runtime.ts',
    'scripts/phase14/run-soak.mjs',
    'scripts/release/release-metadata.mjs',
  ]);
});
