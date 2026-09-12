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
  assert.equal(report.required.acceptanceSourceConsistency, true);
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

test('Phase 14 completion dynamically rejects runtime drift after retained equivalence evidence', async t => {
  const { execFileSync } = await import('node:child_process');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { verifyCurrentRuntimeEquivalence } = await import('../scripts/phase14/verify-completion.mjs');
  const repo = await mkdtemp(join(tmpdir(), 'q1x-phase14-equivalence-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' }).trim();
  git('init', '-q');
  await writeFile(join(repo, 'README.md'), 'baseline\n');
  git('add', 'README.md');
  git('-c', 'user.name=Q1X Test', '-c', 'user.email=q1x@example.invalid', 'commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD');
  await mkdir(join(repo, 'packages/runtime/src'), { recursive: true });
  await writeFile(join(repo, 'packages/runtime/src/runtime.ts'), 'export const drift = true;\n');
  git('add', '.');
  git('-c', 'user.name=Q1X Test', '-c', 'user.email=q1x@example.invalid', 'commit', '-qm', 'runtime drift');
  const report = verifyCurrentRuntimeEquivalence(repo, base);
  assert.equal(report.equivalent, false);
  assert.deepEqual(report.invalidatingPaths, ['packages/runtime/src/runtime.ts']);
});
