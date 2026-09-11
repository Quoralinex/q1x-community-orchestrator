import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifyPhase13Root } from '../scripts/phase13/verify-completion.mjs';

const root = new URL('..', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Phase 13 completion verifier requires every hardening evidence surface', async () => {
  const report = await verifyPhase13Root(root);
  assert.equal(report.schema, 'q1x.phase13-completion-verification.v1');
  assert.equal(report.phase, 13);
  assert.equal(report.betaVersion, '0.2.0-beta.1');
  assert.equal(report.required.stateVersioning, true);
  assert.equal(report.required.backupRestore, true);
  assert.equal(report.required.operationJournal, true);
  assert.equal(report.required.runtimeLimits, true);
  assert.equal(report.required.resilienceEvidence, true);
  assert.equal(report.required.stressEvidence, true);
  assert.equal(report.required.soakEvidence, true);
  assert.equal(report.required.reproducibility, true);
  assert.equal(report.required.compatibilityEvidenceTiers, true);
  assert.equal(report.required.manuals, true);
  assert.equal(report.required.standalone, true);
  assert.equal(report.required.betaPackageIdentity, true);
  assert.equal(report.required.publicBetaWorkflow, true);
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
});

test('beta-readiness workflow is bounded, local-fixture only and read-only by default', async () => {
  const workflow = await text('.github/workflows/beta-readiness.yml');
  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /test:resilience/);
  assert.match(workflow, /test:stress/);
  assert.match(workflow, /scripts\/phase13\/verify-completion\.mjs/);
  assert.match(workflow, /phase13-resilience-evidence\.json/);
  assert.match(workflow, /phase13-stress-evidence\.json/);
  assert.match(workflow, /phase13-reproducibility-evidence\.json/);
  assert.match(workflow, /phase13-sbom\.spdx\.json/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|secrets\./i);
});

test('repository baseline and npm check include Phase 13 only after verifier exists', async () => {
  const baseline = await text('.github/workflows/repository-baseline.yml');
  const packageJson = JSON.parse(await text('package.json'));
  assert.match(baseline, /verify:phase13/);
  assert.match(packageJson.scripts['verify:phase13'], /verify-completion\.mjs/);
  assert.match(packageJson.scripts.check, /verify:phase13/);
});