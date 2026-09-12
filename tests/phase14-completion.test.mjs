import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('Phase 14 completion verifier is fail-closed until retained soak acceptance evidence exists', async () => {
  const { verifyPhase14Root } = await import('../scripts/phase14/verify-completion.mjs');
  const report = await verifyPhase14Root(root);
  assert.equal(report.schema, 'q1x.phase14-completion-verification.v1');
  assert.equal(report.phase, 14);
  assert.equal(report.rcVersion, '1.0.0-rc.1');
  assert.equal(report.currentPackageVersion, '1.0.0-rc.1');
  assert.equal(report.required.stableSurface, true);
  assert.equal(report.required.migrationUpgrade, true);
  assert.equal(report.required.packageSurface, true);
  assert.equal(report.required.rcPackageIdentity, true);
  assert.equal(report.required.stableDocs, true);
  assert.equal(report.required.dependencyEvidence, true);
  assert.equal(report.required.standalone, true);
  assert.equal(report.required.stableReadinessWorkflow, true);
  assert.equal(report.required.publicStableWorkflow, true);
  assert.equal(report.required.polyformLicence, true);
  assert.equal(report.required.acceptedSoakEvidence, false);
  assert.equal(report.required.acceptedRestartEvidence, true);
  assert.equal(report.required.upgradeEvidence, true);
  assert.equal(report.required.runtimeEquivalence, true);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some(item => item.code === 'phase14.acceptedSoakEvidence'));
});

test('Phase 14 completion verifier fails closed for an empty root', async t => {
  const { verifyPhase14Root } = await import('../scripts/phase14/verify-completion.mjs');
  const empty = await mkdtemp(join(tmpdir(), 'q1x-phase14-empty-'));
  t.after(() => rm(empty, { recursive: true, force: true }));
  const report = await verifyPhase14Root(empty);
  assert.equal(report.ok, false);
  assert.ok(report.findings.length >= 8);
  assert.equal(report.required.acceptedSoakEvidence, false);
  assert.equal(report.required.acceptedRestartEvidence, false);
});
