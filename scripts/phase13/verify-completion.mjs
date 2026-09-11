import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyStandaloneRoot } from '../phase12/verify-standalone.mjs';
import { BETA_VERSION as GOVERNED_BETA_VERSION, assertReleaseIdentity, readReleaseIdentity } from '../release/release-metadata.mjs';

export const BETA_VERSION = GOVERNED_BETA_VERSION;
const REQUIRED_SCENARIOS = [
  'transport-timeout', 'connection-refused', 'malformed-response',
  'child-nonzero', 'child-hang', 'bridge-overflow', 'browser-termination',
  'sqlite-contention', 'backup-corruption', 'restart-supervision',
];
const REQUIRED_MANUALS = [
  'docs/user-guide.md', 'docs/operator-guide.md',
  'docs/developer-guide.md', 'docs/cli-reference.md',
];

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}
async function text(path) {
  try { return await readFile(path, 'utf8'); } catch { return ''; }
}
async function json(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
}
function add(findings, condition, code, detail) {
  if (!condition) findings.push({ code, detail });
}
export async function verifyPhase13Root(rootInput) {
  const root = resolve(rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput);
  const findings = [];
  const [stateSchema, store, backup, journal, limits, cli, doctor] = await Promise.all([
    text(join(root, 'packages/runtime/src/state-schema.ts')),
    text(join(root, 'packages/runtime/src/store.ts')),
    text(join(root, 'packages/runtime/src/backup.ts')),
    text(join(root, 'packages/runtime/src/operation-journal.ts')),
    text(join(root, 'packages/runtime/src/runtime-limits.ts')),
    text(join(root, 'packages/runtime/src/cli.ts')),
    text(join(root, 'packages/runtime/src/doctor.ts')),
  ]);
  const [resilience, stress, soak, reproducibility, sbom] = await Promise.all([
    text(join(root, 'scripts/phase13/run-resilience.mjs')),
    text(join(root, 'scripts/phase13/run-stress.mjs')),
    text(join(root, 'scripts/phase13/run-soak.mjs')),
    text(join(root, 'scripts/release/verify-reproducible-packages.mjs')),
    text(join(root, 'scripts/release/generate-sbom.mjs')),
  ]);

  const matrix = await json(join(root, 'compatibility/matrix.json'));
  const testedEvidence = (matrix?.entries ?? [])
    .filter(entry => entry.status === 'tested')
    .flatMap(entry => entry.evidence ?? []);
  const standalone = await verifyStandaloneRoot(root);
  const licence = await text(join(root, 'LICENSE'));
  const baseline = await text(join(root, '.github/workflows/repository-baseline.yml'));
  const betaWorkflow = await text(join(root, '.github/workflows/beta-readiness.yml'));
  const publicBetaWorkflow = await text(join(root, '.github/workflows/public-beta.yml'));
  const packageJson = await json(join(root, 'package.json'));
  let betaPackageIdentity = false;
  try {
    const identity = await readReleaseIdentity(root);
    betaPackageIdentity = assertReleaseIdentity(identity, { version: BETA_VERSION }) === identity;
  } catch {}
  const required = {
    stateVersioning: /CURRENT_STATE_SCHEMA_VERSION\s*=\s*1/.test(stateSchema)
      && /classifyStateSchema/.test(stateSchema) && /verifyIntegrity/.test(store)
      && /state_schema_version/.test(store),
    backupRestore: /createRuntimeBackup/.test(backup) && /verifyRuntimeBackup/.test(backup)
      && /restoreRuntimeBackup/.test(backup) && /backup/.test(cli),
    operationJournal: [
      'intent-recorded', 'dispatched', 'completed', 'failed', 'interrupted-uncertain',
    ].every(state => journal.includes(state)),
    runtimeLimits: /RESOURCE_LIMIT/.test(limits) && /maxConcurrentAssignments/.test(limits)
      && /limits/.test(cli) && /limitWarnings|weakened/.test(doctor),
    resilienceEvidence: /q1x\.phase13-resilience-evidence\.v1/.test(resilience)
      && REQUIRED_SCENARIOS.every(id => resilience.includes(`'${id}'`)),
    stressEvidence: /q1x\.phase13-stress-evidence\.v1/.test(stress)
      && /documentOperations:\s*1_000/.test(stress) && /externalProviderCalls:\s*0/.test(stress),
    soakEvidence: /q1x\.phase13-soak-evidence\.v1/.test(soak)
      && /sqliteIntegrity/.test(soak) && /auditValid/.test(soak),
    reproducibility: /q1x\.release-reproducibility\.v1/.test(reproducibility)
      && /spdxVersion|SPDX-2\.3/.test(sbom),
    compatibilityEvidenceTiers: testedEvidence.length > 0
      && testedEvidence.every(item => ['fixture', 'hosted-runner', 'physical-host'].includes(item.environmentTier)),
    manuals: (await Promise.all(REQUIRED_MANUALS.map(file => exists(join(root, file))))).every(Boolean),
    polyformLicence: /PolyForm Noncommercial License 1\.0\.0/i.test(licence),
    standalone: standalone.ok,
    betaReadinessWorkflow: /verify:phase13/.test(betaWorkflow)
      && /test:resilience/.test(betaWorkflow) && /test:stress/.test(betaWorkflow),
    repositoryBaseline: /verify:phase13/.test(baseline),
    packageScript: /verify-completion\.mjs/.test(packageJson?.scripts?.['verify:phase13'] ?? ''),
    betaPackageIdentity,
    publicBetaWorkflow: /0\.2\.0-beta\.1/.test(publicBetaWorkflow)
      && /workflow_dispatch/.test(publicBetaWorkflow) && /publish_npm/.test(publicBetaWorkflow),
  };
  for (const [surface, present] of Object.entries(required)) {
    add(findings, present, `phase13.${surface}`, `Required Phase 13 surface is incomplete: ${surface}`);
  }
  add(findings, standalone.ok, 'standalone.failed',
    `Standalone verifier reported ${standalone.findings.length} finding(s).`);

  return {
    schema: 'q1x.phase13-completion-verification.v1',
    phase: 13,
    betaVersion: BETA_VERSION,
    ok: findings.length === 0,
    required,
    requiredResilienceScenarios: REQUIRED_SCENARIOS,
    compatibilityEvidenceTiers: [...new Set(testedEvidence.map(item => item.environmentTier))].sort(),
    standalone,
    findings,
  };
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedFile && pathToFileURL(invokedFile).href === import.meta.url) {
  const root = resolve(dirname(thisFile), '../..');
  const report = await verifyPhase13Root(root);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
