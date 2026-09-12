import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyStandaloneRoot } from '../phase12/verify-standalone.mjs';
import { RC_VERSION, assertReleaseIdentity, readReleaseIdentity } from '../release/release-metadata.mjs';
import { buildDependencyInventory } from './dependency-inventory.mjs';
import { runtimeEquivalenceBetween } from './runtime-equivalence.mjs';

const EVIDENCE = 'compatibility/evidence';

export function verifyCurrentRuntimeEquivalence(rootInput, fromSha) {
  const root = resolve(rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput);
  if (!/^[0-9a-f]{40}$/.test(fromSha ?? '')) throw new Error('A 40-character acceptance source SHA is required');
  const toSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  return runtimeEquivalenceBetween({ root, fromSha, toSha });
}
const REQUIRED_DOCS = [
  'docs/versioning.md', 'docs/deprecation-policy.md', 'docs/upgrade-rollback.md',
  'docs/supported-platforms.md', 'docs/stable-release.md',
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
async function sha256(path) {
  try { return createHash('sha256').update(await readFile(path)).digest('hex'); } catch { return null; }
}
function add(findings, condition, code, detail) {
  if (!condition) findings.push({ code, detail });
}
function executionIdentityValid(record) {
  return record?.execution === 'local-manual'
    ? record.workflowRunId === null
    : record?.execution === 'github-actions'
      && ['string', 'number'].includes(typeof record.workflowRunId)
      && String(record.workflowRunId).trim().length > 0;
}

async function acceptedSoak(root) {
  const artifactRel = `${EVIDENCE}/phase14-soak-evidence.json`;
  const artifact = await json(join(root, artifactRel));
  const acceptance = await json(join(root, `${EVIDENCE}/phase14-soak-acceptance.json`));
  const digest = await sha256(join(root, artifactRel));
  const ok = Boolean(
    artifact?.schema === 'q1x.phase14-soak-evidence.v1'
    && /^[0-9a-f]{40}$/.test(artifact?.sourceSha ?? '')
    && Number.isFinite(artifact?.requestedMinutes) && artifact.requestedMinutes >= 360
    && Number.isFinite(artifact?.elapsedMs) && artifact.elapsedMs >= 21_600_000
    && Number.isInteger(artifact?.iterations) && artifact.iterations > 0
    && artifact?.sqliteIntegrity === 'ok'
    && artifact?.auditValid === true
    && artifact?.unresolvedExternalOperations === 0
    && Array.isArray(artifact?.limitBreaches) && artifact.limitBreaches.length === 0
    && artifact?.externalProviderCalls === 0
    && artifact?.state === 'passed'
    && acceptance?.schema === 'q1x.phase14-soak-acceptance.v1'
    && acceptance?.artifactPath === artifactRel
    && /^[0-9a-f]{64}$/.test(acceptance?.artifactSha256 ?? '')
    && acceptance.artifactSha256 === digest
    && acceptance?.sourceSha === artifact.sourceSha
    && executionIdentityValid(acceptance)
    && Number.isFinite(acceptance?.minimumMinutes) && acceptance.minimumMinutes >= 360
    && acceptance?.state === 'passed'
  );
  return { ok, artifact, acceptance, digest };
}

async function acceptedRestart(root) {
  const artifactRel = `${EVIDENCE}/phase14-restart-evidence.json`;
  const artifact = await json(join(root, artifactRel));
  const acceptance = await json(join(root, `${EVIDENCE}/phase14-restart-acceptance.json`));
  const digest = await sha256(join(root, artifactRel));
  const ok = Boolean(
    artifact?.schema === 'q1x.phase14-restart-evidence.v1'
    && /^[0-9a-f]{40}$/.test(artifact?.sourceSha ?? '')
    && Number.isInteger(artifact?.cyclesRequested) && artifact.cyclesRequested >= 1000
    && Number.isInteger(artifact?.cyclesCompleted) && artifact.cyclesCompleted >= 1000
    && artifact?.sqliteIntegrity === 'ok'
    && artifact?.auditValid === true
    && artifact?.unresolvedExternalOperations === 0
    && artifact?.externalProviderCalls === 0
    && artifact?.state === 'passed'
    && acceptance?.schema === 'q1x.phase14-restart-acceptance.v1'
    && acceptance?.artifactPath === artifactRel
    && /^[0-9a-f]{64}$/.test(acceptance?.artifactSha256 ?? '')
    && acceptance.artifactSha256 === digest
    && acceptance?.sourceSha === artifact.sourceSha
    && executionIdentityValid(acceptance)
    && Number.isFinite(acceptance?.minimumCycles) && acceptance.minimumCycles >= 1000
    && acceptance?.state === 'passed'
  );
  return { ok, artifact, acceptance, digest };
}

export async function verifyPhase14Root(rootInput) {
  const root = resolve(rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput);
  const findings = [];
  const [publicSurface, packageSurface, migrationSource, cliCatalogue, upgradeEvidence, runtimeEquivalence] = await Promise.all([
    json(join(root, 'compatibility/public-surface.rc1.json')),
    json(join(root, 'compatibility/package-surface.rc1.json')),
    text(join(root, 'packages/runtime/src/state-migrations.ts')),
    text(join(root, 'packages/runtime/src/cli-catalogue.ts')),
    json(join(root, `${EVIDENCE}/phase14-upgrade-evidence.json`)),
    json(join(root, `${EVIDENCE}/phase14-runtime-equivalence.json`)),
  ]);
  const [stableWorkflow, publicStableWorkflow, licence] = await Promise.all([
    text(join(root, '.github/workflows/stable-readiness.yml')),
    text(join(root, '.github/workflows/public-stable.yml')),
    text(join(root, 'LICENSE')),
  ]);
  const docs = await Promise.all(REQUIRED_DOCS.map(file => text(join(root, file))));
  const standalone = await verifyStandaloneRoot(root);
  const soak = await acceptedSoak(root);
  const restart = await acceptedRestart(root);

  let currentPackageVersion = null;
  let rcPackageIdentity = false;
  try {
    const identity = await readReleaseIdentity(root);
    currentPackageVersion = identity.version ?? null;
    rcPackageIdentity = assertReleaseIdentity(identity, { version: RC_VERSION }) === identity;
  } catch {}

  let dependencyEvidence = false;
  try {
    const inventory = await buildDependencyInventory(root);
    dependencyEvidence = inventory?.schema === 'q1x.phase14-dependency-inventory.v1'
      && /^[0-9a-f]{64}$/.test(inventory?.lockfileSha256 ?? '')
      && inventory?.publicPackages?.length === 8
      && inventory?.packages?.length > 0
      && inventory.packages.every(item => item.name && item.version && item.license)
      && inventory?.externalProviderCalls === 0;
  } catch {}

  const acceptanceSourceShas = [soak.artifact?.sourceSha, restart.artifact?.sourceSha].filter(Boolean);
  const acceptanceSourceSha = acceptanceSourceShas[0] ?? null;
  const acceptanceSourceConsistency = acceptanceSourceShas.length <= 1
    || acceptanceSourceShas.every(value => value === acceptanceSourceSha);

  const upgradeEvidenceValid = Boolean(
    upgradeEvidence?.schema === 'q1x.phase14-upgrade-evidence.v1'
    && /^[0-9a-f]{40}$/.test(upgradeEvidence?.sourceSha ?? '')
    && Array.isArray(upgradeEvidence?.cases) && upgradeEvidence.cases.length === 3
    && upgradeEvidence.cases.every(item => item.state === 'passed')
    && upgradeEvidence?.failureRecovery?.state === 'passed'
    && upgradeEvidence?.externalProviderCalls === 0
    && upgradeEvidence?.state === 'passed'
  );
  let currentRuntimeEquivalence;
  if (acceptanceSourceSha) {
    try { currentRuntimeEquivalence = verifyCurrentRuntimeEquivalence(root, acceptanceSourceSha); } catch {}
  }
  const runtimeEquivalenceValid = Boolean(
    runtimeEquivalence?.schema === 'q1x.phase14-runtime-equivalence.v1'
    && /^[0-9a-f]{40}$/.test(runtimeEquivalence?.fromSha ?? '')
    && /^[0-9a-f]{40}$/.test(runtimeEquivalence?.toSha ?? '')
    && runtimeEquivalence?.equivalent === true
    && (!acceptanceSourceSha || runtimeEquivalence?.fromSha === acceptanceSourceSha)
    && Array.isArray(runtimeEquivalence?.invalidatingPaths)
    && runtimeEquivalence.invalidatingPaths.length === 0
    && (!acceptanceSourceSha || currentRuntimeEquivalence?.equivalent === true)
  );

  const required = {
    stableSurface: publicSurface?.schema === 'q1x.phase14-public-surface.v1'
      && publicSurface?.packages?.length === 8
      && packageSurface?.schema === 'q1x.phase14-package-surface.v1'
      && packageSurface?.packages?.length === 8,
    migrationUpgrade: /inspectRuntimeState/.test(migrationSource)
      && /planStateMigration/.test(migrationSource)
      && /applyStateMigration/.test(migrationSource)
      && /migration inspect/.test(cliCatalogue) && /migration compatibility/.test(cliCatalogue)
      && /migration dry-run/.test(cliCatalogue) && /migration apply/.test(cliCatalogue),
    packageSurface: packageSurface?.schema === 'q1x.phase14-package-surface.v1'
      && packageSurface?.packages?.length === 8,
    rcPackageIdentity,
    stableDocs: docs.every(Boolean)
      && docs.join('\n').includes('1.0.0-rc.1')
      && /not commissioned/i.test(docs.join('\n')),
    dependencyEvidence,
    acceptedSoakEvidence: soak.ok,
    acceptedRestartEvidence: restart.ok,
    upgradeEvidence: upgradeEvidenceValid,
    runtimeEquivalence: runtimeEquivalenceValid,
    acceptanceSourceConsistency,
    standalone: standalone.ok,
    stableReadinessWorkflow: /ubuntu-24\.04/.test(stableWorkflow)
      && /run-soak\.mjs/.test(stableWorkflow) && /--minutes\s+360/.test(stableWorkflow)
      && /run-restart-campaign\.mjs/.test(stableWorkflow) && /--cycles\s+1000/.test(stableWorkflow),
    publicStableWorkflow: /default:\s*1\.0\.0/.test(publicStableWorkflow)
      && /inputs\.release == true/.test(publicStableWorkflow)
      && /inputs\.publish_npm == true/.test(publicStableWorkflow)
      && /refs\/heads\/main/.test(publicStableWorkflow)
      && /attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a/.test(publicStableWorkflow)
      && /npm audit --omit=dev --audit-level=critical --json/.test(publicStableWorkflow),
    polyformLicence: /PolyForm Noncommercial License 1\.0\.0/i.test(licence),
  };
  for (const [surface, present] of Object.entries(required)) {
    add(findings, present, `phase14.${surface}`, `Required Phase 14 surface is incomplete: ${surface}`);
  }

  return {
    schema: 'q1x.phase14-completion-verification.v1',
    phase: 14,
    rcVersion: RC_VERSION,
    currentPackageVersion,
    ok: findings.length === 0,
    required,
    acceptedEvidence: {
      soak: {
        sourceSha: soak.artifact?.sourceSha ?? null,
        requestedMinutes: soak.artifact?.requestedMinutes ?? null,
        elapsedMs: soak.artifact?.elapsedMs ?? null,
        state: soak.artifact?.state ?? null,
        artifactSha256: soak.acceptance?.artifactSha256 ?? null,
      },
      restart: {
        sourceSha: restart.artifact?.sourceSha ?? null,
        cyclesCompleted: restart.artifact?.cyclesCompleted ?? null,
        state: restart.artifact?.state ?? null,
        artifactSha256: restart.acceptance?.artifactSha256 ?? null,
      },
      upgrade: {
        sourceSha: upgradeEvidence?.sourceSha ?? null,
        state: upgradeEvidence?.state ?? null,
      },
      runtimeEquivalence: runtimeEquivalence ?? null,
      currentRuntimeEquivalence: currentRuntimeEquivalence ?? null,
    },
    standalone,
    findings,
  };
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedFile && pathToFileURL(invokedFile).href === import.meta.url) {
  const root = resolve(dirname(thisFile), '../..');
  const report = await verifyPhase14Root(root);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
