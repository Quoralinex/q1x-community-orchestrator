# Phase 14 Stable Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hardened standalone Community Orchestrator into an evidence-backed `1.0.0-rc.1` stable-readiness candidate while keeping stable `1.0.0` commissioning and npm publication as separate explicit authorities.

**Architecture:** Preserve the single-node SQLite/filesystem baseline and add stability contracts around it: deterministic public-surface inventories, explicit state migration, executable upgrade fixtures, package/consumer compatibility evidence, long-duration reliability evidence, release provenance and stable documentation. The implementation reuses existing Phase 13 backup, reproducibility, SBOM, standalone and evidence-tier machinery rather than introducing distributed infrastructure or private services.

**Tech Stack:** Node.js 24+, TypeScript 7, built-in `node:sqlite`, Node test runner, npm workspaces, GitHub Actions, JSON/JSON Schema, SHA-256, SPDX 2.3.

**Spec:** `docs/superpowers/specs/2026-09-11-phase14-stable-release-readiness-design.md`

## Global Constraints

- Repository scope is only `Quoralinex/q1x-community-orchestrator`.
- Baseline is protected `main` at `dd8bd0b53106fe5db60743c66bd3c1709fa95425` plus the approved Phase 14 design commit.
- Candidate source identity is exactly `1.0.0-rc.1`; stable commissioning target is exactly `1.0.0`.
- `v0.2.0-beta.1`, `v1.0.0-rc.1` and `v1.0.0` are never created by implementation tasks.
- All eight public packages remain version-aligned with exact internal `@quoralinex/q1x-community-*` dependency versions.
- Node.js floor remains `>=24`.
- Current durable-state schema remains version `1` unless a real data-model requirement proves otherwise.
- Public repository and package licence remains PolyForm Noncommercial License 1.0.0.
- No PostgreSQL, object storage, distributed workers, hosted multi-tenancy, enterprise IAM, mandatory Q1X Control Plane/private Quoralinex service or private registry dependency.
- No paid provider calls in repository tests, restart campaigns or soak evidence.
- External side effects remain fail-closed on uncertainty; do not broaden automatic retry semantics.
- Six hours is the minimum accepted stable-readiness soak; 1,000 cycles is the minimum accepted restart/recovery campaign.
- GitHub Actions use full commit SHA pins and least-privilege permissions.
- Stable GitHub release creation and npm publication are separate explicit authorities; both default disabled.

---

### Task 1: Freeze the intended stable public surface

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-phase14-stable-release-readiness-design.md`
- Create: `scripts/phase14/public-surface.mjs`
- Create: `compatibility/public-surface.rc1.json`
- Create: `tests/phase14-public-surface.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `collectPublicSurface(root): Promise<PublicSurfaceInventory>`.
- Produces: `comparePublicSurface(baseline, current): { ok: boolean, findings: Array<{code:string, detail:string}> }`.
- Inventory schema: `q1x.phase14-public-surface.v1`.
- Later tasks consume `compatibility/public-surface.rc1.json` as the intended RC compatibility baseline.

- [ ] **Step 1: Correct approved-spec presentation defects**

Change the spec status to `approved design` and split the four accidentally joined sentences/bullets without altering any requirement.

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-09-11-phase14-stable-release-readiness-design.md
```

Expected: exit `0`.

- [ ] **Step 2: Write the failing public-surface tests**

Create tests covering deterministic package metadata, `v1` schema digests, CLI command usage strings, connector IDs/configuration-key names, and fail-closed removal/drift detection.

```js
const inventory = await collectPublicSurface(root);
assert.equal(inventory.schema, 'q1x.phase14-public-surface.v1');
assert.equal(inventory.packages.length, 8);
assert.ok(inventory.schemas.every(item => /^[0-9a-f]{64}$/.test(item.sha256)));
assert.ok(inventory.cli.some(item => item.usage === 'q1x help'));
assert.equal(comparePublicSurface(inventory, inventory).ok, true);
const broken = structuredClone(inventory);
broken.cli = broken.cli.filter(item => item.usage !== 'q1x help');
assert.equal(comparePublicSurface(inventory, broken).ok, false);
```

- [ ] **Step 3: Run the focused test and confirm RED**

Run:

```bash
node --test tests/phase14-public-surface.test.mjs
```

Expected: FAIL because `scripts/phase14/public-surface.mjs` and the baseline do not exist.

- [ ] **Step 4: Implement deterministic collection and comparison**

`collectPublicSurface()` must build before importing executable catalogues, sort every array, omit timestamps/machine paths, and emit only stable-facing data:

```js
return {
  schema: 'q1x.phase14-public-surface.v1',
  contracts: { family: 'v1', schemas },
  packages,
  cli: getCliCommandCatalogue().map(({ usage, purpose }) => ({ usage, purpose })),
  connectors: getConnectorCatalogue().map(item => ({
    id: item.id,
    category: item.category,
    protocol: item.protocol,
    parameterKeys: Object.keys(item.parameters ?? {}).sort(),
    environmentKeys: Object.keys(item.environment ?? {}).sort(),
  })),
};
```

`comparePublicSurface()` must fail on missing packages/exports/bins/schema URNs/CLI usages/connector IDs and changed schema digests, but may permit additive entries before the RC baseline is formally accepted.

- [ ] **Step 5: Generate and verify the checked-in baseline**

Run:

```bash
npm run build
node scripts/phase14/public-surface.mjs --write compatibility/public-surface.rc1.json
node scripts/phase14/public-surface.mjs --check compatibility/public-surface.rc1.json
node --test tests/phase14-public-surface.test.mjs
git diff --check
```

Expected: tests PASS and `--check` reports zero findings.

- [ ] **Step 6: Add the fast gate and commit**

Add `test:surface` to `package.json` without adding Phase 14 completion to `npm run check` yet.

```bash
git add docs/superpowers/specs/2026-09-11-phase14-stable-release-readiness-design.md scripts/phase14/public-surface.mjs compatibility/public-surface.rc1.json tests/phase14-public-surface.test.mjs package.json
git commit -m "Phase 14: freeze intended stable public surface"
```

---

### Task 2: Replace silent legacy adoption with an explicit migration registry

**Files:**
- Create: `packages/runtime/src/state-migrations.ts`
- Modify: `packages/runtime/src/state-schema.ts`
- Modify: `packages/runtime/src/store.ts`
- Modify: `packages/runtime/src/errors.ts`
- Modify: `packages/runtime/src/index.ts`
- Create: `tests/runtime-state-migration.test.mjs`
- Modify: `tests/runtime-state-schema.test.mjs`

**Interfaces:**
- Produces: `inspectRuntimeState(home: string): StateMigrationInspection`.
- Produces: `planStateMigration(home: string): StateMigrationPlan`.
- Produces: `applyStateMigrations(home: string, options?: { dryRun?: boolean; backupPath?: string }): Promise<StateMigrationResult>`.
- `SqliteStore.open()` may initialise a genuinely absent database at schema 1, but an existing legacy/older database requiring migration must throw `RuntimeError('MIGRATION_REQUIRED', ...)`.

- [ ] **Step 1: Write failing migration-state tests**

Cover four states: absent home, schema 1 current, legacy Alpha 2 database with runtime tables but no schema marker, and future schema 2.

```js
const inspection = inspectRuntimeState(alpha2Home);
assert.equal(inspection.state, 'migration-required');
assert.equal(inspection.sourceSchemaVersion, null);
assert.equal(inspection.targetSchemaVersion, 1);
assert.deepEqual(inspection.steps, ['legacy-unversioned-to-v1']);
assert.throws(() => SqliteStore.open(alpha2Home), error => error.code === 'MIGRATION_REQUIRED');
```

- [ ] **Step 2: Confirm RED**

Run:

```bash
npm run build && node --test tests/runtime-state-migration.test.mjs tests/runtime-state-schema.test.mjs
```

Expected: FAIL because existing stores silently adopt missing/older schema markers.

- [ ] **Step 3: Implement the registry and inspection model**

Define exact types:

```ts
export type RuntimeStateKind = 'fresh' | 'current' | 'migration-required' | 'future' | 'invalid';
export interface StateMigrationInspection {
  schema: 'q1x.runtime-state-inspection.v1';
  state: RuntimeStateKind;
  sourceSchemaVersion: number | null;
  targetSchemaVersion: number;
  steps: string[];
}
export interface StateMigrationStep {
  id: string;
  source: number | 'legacy-unversioned';
  target: number;
  destructive: boolean;
  apply(db: DatabaseSync): void;
  verify(db: DatabaseSync): void;
}
```

Register only `legacy-unversioned-to-v1`. Its precondition requires known historical runtime tables and no `state_schema_version`; its action creates/sets the marker transactionally and does not rewrite user documents.

- [ ] **Step 4: Make store opening fail closed**

Before normal schema setup, detect whether `state.sqlite` existed. For a fresh database, initialise schema 1. For an existing migration-required database, close and throw `MIGRATION_REQUIRED`. For future/invalid state, throw `INCOMPATIBLE_STATE`. Remove automatic `UPDATE runtime_metadata` upgrade behavior.

- [ ] **Step 5: Prove transactional migration failure**

The test supplies a test registry step whose `apply()` writes then throws. After `applyStateMigrations`, assert the schema marker and test write both rolled back.

```js
await assert.rejects(() => applyStateMigrations(home, { registry: failingRegistry }), /MIGRATION_FAILED/);
assert.equal(readMarker(home), 0);
assert.equal(readInjectedRow(home), undefined);
```

Expose the injectable registry only from the migration module function parameter; do not add an environment-variable failure switch.

- [ ] **Step 6: Run focused and regression tests, then commit**

```bash
npm run build
node --test tests/runtime-state-migration.test.mjs tests/runtime-state-schema.test.mjs tests/runtime-store.test.mjs
git diff --check
git add packages/runtime/src/state-migrations.ts packages/runtime/src/state-schema.ts packages/runtime/src/store.ts packages/runtime/src/errors.ts packages/runtime/src/index.ts tests/runtime-state-migration.test.mjs tests/runtime-state-schema.test.mjs
git commit -m "Phase 14: add explicit state migration registry"
```

---

### Task 3: Add migration CLI, dry-run, backup proof and audit evidence

**Files:**
- Modify: `packages/runtime/src/backup.ts`
- Modify: `packages/runtime/src/cli.ts`
- Modify: `packages/runtime/src/cli-catalogue.ts`
- Create: `tests/runtime-cli-migration.test.mjs`
- Modify: `tests/runtime-backup.test.mjs`

**Interfaces:**
- Produces CLI commands `migration inspect`, `migration dry-run`, `migration apply` and `migration compatibility`.
- Produces: `digestRuntimeBackup(path): Promise<string>` as a deterministic SHA-256 over verified manifest/file records.
- CLI output schema: `q1x.runtime-migration-cli.v1`.

- [ ] **Step 1: Write CLI RED tests**

```js
const inspect = runCli(['--home', alpha2Home, 'migration', 'inspect']);
assert.equal(inspect.schema, 'q1x.runtime-migration-cli.v1');
assert.equal(inspect.state, 'migration-required');
const dryRun = runCli(['--home', alpha2Home, 'migration', 'dry-run']);
assert.equal(dryRun.applied, false);
assert.equal(readSchemaMarker(alpha2Home), undefined);
```

Also prove `migration apply` succeeds for the non-destructive legacy marker migration and that a destructive test migration is rejected without a verified backup.

- [ ] **Step 2: Confirm RED**

Run:

```bash
npm run build && node --test tests/runtime-cli-migration.test.mjs tests/runtime-backup.test.mjs
```

Expected: FAIL because migration commands and deterministic backup digest are absent.

- [ ] **Step 3: Add deterministic backup digest**

After `verifyRuntimeBackup(path)` succeeds, hash canonical JSON containing sorted `{path,size,sha256}` records plus manifest schema/state version. Reject invalid backups before hashing.

```ts
export async function digestRuntimeBackup(path: string): Promise<string> {
  const verification = await verifyRuntimeBackup(path);
  if (!verification.valid) throw new RuntimeError('BACKUP_INTEGRITY_FAILED', 'Backup verification failed');
  const manifest = await readManifest(resolve(path));
  return createHash('sha256').update(canonicalBackupEvidence(manifest)).digest('hex');
}
```

- [ ] **Step 4: Route migration before normal runtime open**

Mirror the existing backup special-case in `cli.ts` so inspection/dry-run/apply can operate on a home that normal startup intentionally refuses.

```ts
if (args[0] === 'migration') {
  args.shift();
  writeResult(await executeMigration(home, args));
} else if (args[0] === 'backup') {
  // existing path
}
```

On successful apply, reopen the runtime and append a metadata-only `state.migration.applied` audit receipt containing migration IDs, source/target versions and optional backup digest; never store home/backup paths.

- [ ] **Step 5: Add catalogue entries and regenerate CLI reference**

Add exact usages:

```text
q1x --home <path> migration inspect
q1x --home <path> migration compatibility
q1x --home <path> migration dry-run [--backup <path>]
q1x --home <path> migration apply [--backup <path>]
```

Run the existing CLI reference generator and require exact generated output.

- [ ] **Step 6: Verify and commit**

```bash
npm run build
node --test tests/runtime-cli-migration.test.mjs tests/runtime-backup.test.mjs tests/phase13-docs.test.mjs
git diff --check
git add packages/runtime/src/backup.ts packages/runtime/src/cli.ts packages/runtime/src/cli-catalogue.ts docs/cli-reference.md tests/runtime-cli-migration.test.mjs tests/runtime-backup.test.mjs
git commit -m "Phase 14: add governed state migration CLI"
```

---

### Task 4: Build executable Alpha 2 / Phase 13 upgrade evidence

**Files:**
- Create: `tests/fixtures/state/v0.1.0-alpha.2.sql`
- Create: `tests/fixtures/state/phase13-0.2.0-beta.1.sql`
- Create: `tests/fixtures/state/fixture-manifest.json`
- Create: `scripts/phase14/run-upgrade-matrix.mjs`
- Create: `tests/phase14-upgrade-matrix.test.mjs`

**Interfaces:**
- Produces evidence schema `q1x.phase14-upgrade-evidence.v1`.
- Produces `runUpgradeMatrix({ sourceSha }): Promise<UpgradeEvidence>`.
- Fixture recipes contain only deterministic synthetic Q1X data and no machine path, credential, prompt or user content.

- [ ] **Step 1: Write upgrade-matrix RED tests**

Require exactly `fresh`, `v0.1.0-alpha.2` and `0.2.0-beta.1` cases, with integrity/audit/read-write/backup/restore outcomes.

```js
const report = await runUpgradeMatrix({ sourceSha: TEST_SHA });
assert.equal(report.schema, 'q1x.phase14-upgrade-evidence.v1');
assert.deepEqual(report.cases.map(item => item.sourceRelease), ['fresh', 'v0.1.0-alpha.2', '0.2.0-beta.1']);
assert.ok(report.cases.every(item => item.sqliteIntegrity === 'ok'));
assert.ok(report.cases.every(item => item.backupVerified && item.restoreVerified));
assert.equal(report.externalProviderCalls, 0);
```

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/phase14-upgrade-matrix.test.mjs
```

Expected: FAIL because fixtures/runner do not exist.

- [ ] **Step 3: Add deterministic SQL fixtures**

The Alpha 2 recipe must omit `runtime_metadata.state_schema_version` while containing the historical document/checkpoint/audit-compatible tables needed by the migration precondition. The Phase 13 recipe must contain schema marker `1`. `fixture-manifest.json` records release label, recipe path and SHA-256 of each SQL recipe.

- [ ] **Step 4: Implement the matrix runner**

For each case: materialise a temporary home, inspect, migrate if required, reopen, verify SQLite and audit, perform representative mission/programme/work-graph read/write, create+verify backup, restore into a clean target, reopen restored state and verify again.

The report must include only bounded metadata:

```js
{
  sourceRelease,
  sourceSchemaVersion,
  targetSchemaVersion: 1,
  migrationSteps,
  fixtureSha256,
  sqliteIntegrity: 'ok',
  auditValid: true,
  readWriteVerified: true,
  backupVerified: true,
  restoreVerified: true,
  state: 'passed'
}
```

- [ ] **Step 5: Add an explicit failure/recovery case**

Use the injectable failing registry from Task 2 to prove a migration failure leaves the historical fixture unchanged and produces `recoveryOutcome: 'transaction-rolled-back'` rather than success.

- [ ] **Step 6: Verify and commit**

```bash
npm run build
node --test tests/phase14-upgrade-matrix.test.mjs tests/runtime-state-migration.test.mjs
node scripts/phase14/run-upgrade-matrix.mjs --source-sha "$(git rev-parse HEAD)" >/tmp/phase14-upgrade.json
node -e "const r=require('/tmp/phase14-upgrade.json'); if(r.state!=='passed') process.exit(1)"
git diff --check
git add tests/fixtures/state scripts/phase14/run-upgrade-matrix.mjs tests/phase14-upgrade-matrix.test.mjs
git commit -m "Phase 14: add executable upgrade matrix"
```

---

### Task 5: Freeze package/consumer compatibility and extend release metadata

**Files:**
- Modify: `scripts/release/release-metadata.mjs`
- Modify: `scripts/release/prepare-prerelease.mjs`
- Modify: `scripts/release/verify-packed-consumer.mjs`
- Create: `scripts/phase14/package-surface.mjs`
- Create: `compatibility/package-surface.rc1.json`
- Create: `tests/phase14-package-surface.test.mjs`
- Modify: `tests/release-beta-governance.test.mjs`

**Interfaces:**
- Adds constants `RC_VERSION = '1.0.0-rc.1'` and `STABLE_VERSION = '1.0.0'`.
- Manifest statuses become `public-alpha`, `beta-candidate`, `stable-rc-candidate`, `stable`.
- Produces package-surface schema `q1x.phase14-package-surface.v1` from packed artifacts.

- [ ] **Step 1: Write RED tests for RC/stable release metadata**

```js
assert.equal(RC_VERSION, '1.0.0-rc.1');
assert.equal(STABLE_VERSION, '1.0.0');
assert.doesNotThrow(() => assertReleaseIdentity(rcIdentity, { version: RC_VERSION }));
assert.equal(buildReleaseManifest({ ...input, identity: rcIdentity, version: RC_VERSION }).status, 'stable-rc-candidate');
```

Also require the packed-consumer verifier to accept RC and stable manifests while retaining Alpha/Beta support.

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/release-beta-governance.test.mjs tests/phase14-package-surface.test.mjs
```

Expected: FAIL because RC/stable versions and package-surface generator are absent.

- [ ] **Step 3: Generalise release metadata without changing source package versions yet**

Add RC/stable versions to `SUPPORTED_RELEASE_VERSIONS`, map manifest status by exact version, and keep historical defaults unchanged so Alpha/Beta regression tests remain meaningful.

- [ ] **Step 4: Generate stable package-surface evidence from staged RC tarballs**

The package surface records package name, export map, bins, engine floor, licence, exact internal dependency graph and sorted packed-file inventory. It excludes tarball byte hashes so reproducible content is compared separately.

```bash
node scripts/release/prepare-prerelease.mjs --version 1.0.0-rc.1 --output /tmp/q1x-rc-surface --source-sha "$(git rev-parse HEAD)"
node scripts/phase14/package-surface.mjs --artifacts /tmp/q1x-rc-surface --write compatibility/package-surface.rc1.json
```

- [ ] **Step 5: Verify clean external consumption**

```bash
node scripts/release/verify-packed-consumer.mjs --artifacts /tmp/q1x-rc-surface
node scripts/phase14/package-surface.mjs --artifacts /tmp/q1x-rc-surface --check compatibility/package-surface.rc1.json
node --test tests/phase14-package-surface.test.mjs tests/release-beta-governance.test.mjs
git diff --check
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/release scripts/phase14/package-surface.mjs compatibility/package-surface.rc1.json tests/phase14-package-surface.test.mjs tests/release-beta-governance.test.mjs
git commit -m "Phase 14: freeze RC package consumer surface"
```

---

### Task 6: Add bounded restart campaign, six-hour soak and runtime-equivalence proof

**Files:**
- Create: `scripts/phase14/run-restart-campaign.mjs`
- Create: `scripts/phase14/run-soak.mjs`
- Create: `scripts/phase14/runtime-equivalence.mjs`
- Create: `tests/phase14-reliability.test.mjs`
- Modify: `scripts/phase13/run-soak.mjs` only if an additive final convergence/resource field is required.

**Interfaces:**
- Restart evidence schema: `q1x.phase14-restart-evidence.v1`.
- Soak evidence schema: `q1x.phase14-soak-evidence.v1`.
- Equivalence evidence schema: `q1x.phase14-runtime-equivalence.v1`.
- `runRestartCampaign({ sourceSha, cycles })` accepts smoke cycles in tests and 1,000 for acceptance.
- `runStableSoak({ sourceSha, minutes })` rejects `minutes < 360` outside test-only direct function smoke calls.

- [ ] **Step 1: Write RED reliability tests**

```js
const restart = await runRestartCampaign({ sourceSha: TEST_SHA, cycles: 10 });
assert.equal(restart.cyclesCompleted, 10);
assert.equal(restart.sqliteIntegrity, 'ok');
assert.equal(restart.auditValid, true);
assert.equal(restart.externalProviderCalls, 0);
await assert.rejects(() => runStableSoak({ sourceSha: TEST_SHA, minutes: 359 }), /at least 360/);
```

Runtime-equivalence tests must reject changes under `packages/**`, root/package manifests, lockfile and runtime/release scripts, while accepting docs/tests/workflows/retained-evidence-only changes.

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/phase14-reliability.test.mjs
```

Expected: FAIL because Phase 14 runners do not exist.

- [ ] **Step 3: Implement restart/recovery campaign**

Each cycle opens the same local runtime home, reconciles interrupted assignments/external operations, verifies audit and SQLite integrity, writes one bounded checkpoint/operation fixture, closes cleanly and records peak RSS/handle/fd observations. Inject a controlled dispatched-but-unfinished operation periodically so restart reconciliation is actually exercised.

- [ ] **Step 4: Implement stable soak wrapper**

Reuse Phase 13 local-only operation patterns but require >=360 minutes for command-line acceptance. Retain `iterations`, `elapsedMs`, `peakRss`, handles/fds, `sqliteIntegrity`, `auditValid`, `unresolvedExternalOperations`, `limitBreaches`, `externalProviderCalls: 0` and final `state`.

- [ ] **Step 5: Implement explicit runtime-equivalence changed-path policy**

Allow only:

```js
const RUNTIME_NEUTRAL_PREFIXES = [
  '.github/workflows/', 'docs/', 'tests/', 'compatibility/evidence/'
];
const RUNTIME_NEUTRAL_EXACT = [
  'scripts/phase14/verify-completion.mjs'
];
```

Anything under `packages/`, `package.json`, `package-lock.json`, Docker/Compose, `scripts/release/`, or other `scripts/phase14/` files invalidates equivalence.

- [ ] **Step 6: Run bounded evidence and commit**

```bash
npm run build
node --test tests/phase14-reliability.test.mjs
node scripts/phase14/run-restart-campaign.mjs --source-sha "$(git rev-parse HEAD)" --cycles 25 >/tmp/phase14-restart-smoke.json
git diff --check
git add scripts/phase14 scripts/phase13/run-soak.mjs tests/phase14-reliability.test.mjs
git commit -m "Phase 14: add stable reliability evidence runners"
```

---

### Task 7: Add deterministic dependency/licence evidence and commissioning-only vulnerability gate

**Files:**
- Create: `scripts/phase14/dependency-inventory.mjs`
- Create: `tests/phase14-dependency-inventory.test.mjs`
- Modify later workflow files only in Task 10.

**Interfaces:**
- Produces schema `q1x.phase14-dependency-inventory.v1`.
- Inventory is generated from the installed/locked production dependency graph of the eight governed packages and records name, version, licence and whether direct/transitive.

- [ ] **Step 1: Write RED inventory tests**

```js
const inventory = await buildDependencyInventory(root);
assert.equal(inventory.schema, 'q1x.phase14-dependency-inventory.v1');
assert.match(inventory.lockfileSha256, /^[0-9a-f]{64}$/);
assert.ok(inventory.packages.length > 0);
assert.ok(inventory.packages.every(item => item.name && item.version && item.license));
assert.ok(inventory.publicPackages.every(item => item.license === 'SEE LICENSE IN LICENSE'));
```

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/phase14-dependency-inventory.test.mjs
```

- [ ] **Step 3: Implement production-graph traversal**

Start from the eight workspace package `dependencies`, resolve transitive `node_modules/<name>/package.json` entries after `npm ci`, sort by `name@version`, record SPDX-ish licence text exactly as package metadata declares it, and fail if a shipped dependency has no declared licence.

- [ ] **Step 4: Verify and commit**

```bash
npm ci --no-audit --no-fund
node --test tests/phase14-dependency-inventory.test.mjs
node scripts/phase14/dependency-inventory.mjs > /tmp/phase14-dependencies.json
node -e "const r=require('/tmp/phase14-dependencies.json'); if(!r.packages.length) process.exit(1)"
git diff --check
git add scripts/phase14/dependency-inventory.mjs tests/phase14-dependency-inventory.test.mjs
git commit -m "Phase 14: add release dependency evidence"
```

The network-dependent critical-vulnerability check is intentionally not a local/PR requirement here; Task 10 adds it only to manual/scheduled or commissioning lanes using `npm audit --omit=dev --audit-level=critical --json`.

---

### Task 8: Establish stable versioning, deprecation, upgrade and support documentation

**Files:**
- Create: `docs/versioning.md`
- Create: `docs/deprecation-policy.md`
- Create: `docs/upgrade-rollback.md`
- Create: `docs/supported-platforms.md`
- Create: `docs/stable-release.md`
- Modify: `README.md`
- Modify: `docs/index.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/known-limitations.md`
- Modify: `docs/prerelease.md` only to add historical/Phase-13-candidate navigation context
- Create: `tests/phase14-docs.test.mjs`

**Interfaces:**
- Active docs call `1.0.0-rc.1` an RC/stable-readiness candidate, never a commissioned stable release.
- `docs/public-alpha.md` remains byte-for-byte unchanged.
- Stable compatibility promise is limited to the inventory governed in Tasks 1 and 5.

- [ ] **Step 1: Write documentation RED tests**

Tests require the five new documents, explicit SemVer/deprecation rules, migration backup/restore guidance, platform evidence limits, PolyForm licensing, and these claim boundaries:

```js
assert.match(activeDocs, /1\.0\.0-rc\.1/);
assert.doesNotMatch(activeDocs, /1\.0\.0.*(?:current|commissioned|released)/i);
assert.match(versioning, /breaking.*major/i);
assert.match(deprecation, /replacement/i);
assert.match(upgrade, /migration inspect/);
assert.match(upgrade, /verified backup/i);
```

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/phase14-docs.test.mjs
```

- [ ] **Step 3: Write the stable policy documents**

`versioning.md` defines stable surfaces and SemVer intent; `deprecation-policy.md` requires replacement + migration guidance and no minor/patch removal; `upgrade-rollback.md` documents inspect/dry-run/apply, backup requirement and restore-based rollback; `supported-platforms.md` maps claims to the compatibility matrix; `stable-release.md` lists commissioning evidence and explicit nonclaims.

- [ ] **Step 4: Update active navigation/status without rewriting history**

README/roadmap/index/known limitations identify Phase 14 and RC status. `docs/public-alpha.md` remains untouched. `docs/prerelease.md` gains only a short archival-context link to the newer RC page.

- [ ] **Step 5: Verify generated/source agreement and commit**

```bash
node --test tests/phase14-docs.test.mjs tests/phase13-docs.test.mjs
node scripts/phase14/public-surface.mjs --check compatibility/public-surface.rc1.json
node scripts/compatibility/generate-matrix.mjs --check
git diff --check
git add README.md docs tests/phase14-docs.test.mjs
git commit -m "Phase 14: define stable compatibility and support policy"
```

---

### Task 9: Align source to `1.0.0-rc.1` and freeze the runtime candidate

**Files:**
- Modify: all eight `packages/*/package.json`
- Modify: `package-lock.json`
- Modify: `scripts/release/release-metadata.mjs`
- Modify: `tests/release-commissioning.test.mjs`
- Modify: `tests/release-phase12-governance.test.mjs`
- Modify: `tests/release-beta-governance.test.mjs`
- Create: `tests/release-stable-governance.test.mjs`

**Interfaces:**
- Current source identity becomes exactly `1.0.0-rc.1`.
- Historical Alpha 2 and Beta identities remain testable using synthetic historical identities rather than requiring current manifests to regress.
- `preparePrerelease(..., version: '1.0.0')` remains staging-only and does not change source files.

- [ ] **Step 1: Write RC identity RED tests**

Require all eight package manifests and every internal public Q1X dependency to be exactly `1.0.0-rc.1`, while historical Alpha/Beta regression helpers continue to pass.

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/release-stable-governance.test.mjs tests/release-commissioning.test.mjs tests/release-beta-governance.test.mjs
```

Expected: FAIL because source manifests remain beta.

- [ ] **Step 3: Align package manifests and lockfile**

Set all eight versions to `1.0.0-rc.1`, rewrite only internal Q1X dependency versions to exact `1.0.0-rc.1`, then run:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --no-audit --no-fund
```

- [ ] **Step 4: Verify RC artifacts and full bounded repository gate**

```bash
npm run check
npm run test:compatibility
npm run test:resilience
npm run test:stress
npm run test:surface
node --test tests/phase14-upgrade-matrix.test.mjs tests/phase14-reliability.test.mjs tests/phase14-dependency-inventory.test.mjs tests/release-stable-governance.test.mjs
node scripts/release/prepare-prerelease.mjs --version 1.0.0-rc.1 --output /tmp/q1x-rc --source-sha "$(git rev-parse HEAD)"
node scripts/release/verify-packed-consumer.mjs --artifacts /tmp/q1x-rc
node scripts/release/verify-reproducible-packages.mjs "$(git rev-parse HEAD)"
git diff --check
```

- [ ] **Step 5: Commit and push the runtime-frozen RC candidate**

```bash
git add packages package-lock.json scripts/release tests/release-*.test.mjs
git commit -m "Phase 14: align stable RC candidate identity"
git push -u origin feat/phase14-stable-release-readiness
```

Capture `RC_RUNTIME_SHA=$(git rev-parse HEAD)`. After this commit, do not change runtime/product paths unless a defect forces the six-hour soak to be restarted.

- [ ] **Step 6: Start long acceptance evidence immediately**

Start the six-hour soak detached on the Mac and the 1,000-cycle restart campaign against `RC_RUNTIME_SHA`:

```bash
nohup node scripts/phase14/run-soak.mjs --source-sha "$RC_RUNTIME_SHA" --minutes 360 --output "$HOME/q1x-phase14-soak-$RC_RUNTIME_SHA.json" >"$HOME/q1x-phase14-soak-$RC_RUNTIME_SHA.log" 2>&1 &
node scripts/phase14/run-restart-campaign.mjs --source-sha "$RC_RUNTIME_SHA" --cycles 1000 --output "$HOME/q1x-phase14-restart-$RC_RUNTIME_SHA.json"
```

Do not claim acceptance until both evidence files are validated and retained in Task 11.

---

### Task 10: Add stable-readiness and fail-closed public-stable workflows

**Files:**
- Create: `.github/workflows/stable-readiness.yml`
- Create: `.github/workflows/public-stable.yml`
- Modify: `.github/workflows/repository-baseline.yml`
- Create: `tests/phase14-workflows.test.mjs`

**Interfaces:**
- `stable-readiness.yml` is read-only for ordinary PR/push validation and has manual long-evidence jobs.
- `public-stable.yml` inputs: `version` default `1.0.0`, `release` default `false`, `publish_npm` default `false`.
- No workflow invocation in this phase sets either mutation boolean true.

- [ ] **Step 1: Write workflow RED tests**

Require Ubuntu 24.04, Node 24, full-SHA action pins, read-only default permissions, exact version guards, protected-main release guard, immutable tag/release refusal, separate npm OIDC job and no private service secrets.

Also require `actions/attest-build-provenance` to be pinned to commit `977bb373ede98d70efdf65b84cb5f73e068dcc2a` if attestation is used.

- [ ] **Step 2: Confirm RED**

```bash
node --test tests/phase14-workflows.test.mjs
```

- [ ] **Step 3: Implement `stable-readiness.yml`**

The normal job runs `npm ci`, `npm run check`, surface check, upgrade matrix, bounded restart smoke, compatibility/resilience/stress, RC artifact preparation, external consumer verification, reproducibility, dependency inventory and Phase 14 verifier when available. Upload exact-head JSON evidence.

Add manual-only `soak` and `restart-campaign` jobs with `timeout-minutes: 390` and `cycles: 1000`; no provider secrets are supplied.

- [ ] **Step 4: Implement `public-stable.yml` validation/release/npm separation**

Validation stages `1.0.0` artifacts from the RC source and verifies consumer/reproducibility/SBOM/checksums/surface/dependency evidence. The release job runs only when:

```yaml
if: >-
  github.event_name == 'workflow_dispatch' &&
  inputs.release == true &&
  inputs.version == '1.0.0' &&
  github.ref == 'refs/heads/main'
```

Before `gh release create`, re-query remote `main`, refuse existing `v1.0.0` tag/release, and create build provenance with the pinned attestation action. The npm job additionally requires `publish_npm == true`, environment `npm-public-stable`, `id-token: write`, and publishes only downloaded verified tarballs.

- [ ] **Step 5: Add repository-baseline structural checks and verify**

Do not yet add `verify:phase14` to root `npm run check` if long acceptance evidence is still absent; repository baseline may invoke the focused structural tests separately until Task 11.

```bash
node --test tests/phase14-workflows.test.mjs tests/packaging.test.mjs tests/release-stable-governance.test.mjs
git diff --check
git add .github/workflows tests/phase14-workflows.test.mjs
git commit -m "Phase 14: add stable readiness release governance"
git push
```

---

### Task 11: Retain acceptance evidence and make Phase 14 completion fail closed

**Files:**
- Create: `compatibility/evidence/phase14-soak-evidence.json`
- Create: `compatibility/evidence/phase14-soak-acceptance.json`
- Create: `compatibility/evidence/phase14-restart-evidence.json`
- Create: `compatibility/evidence/phase14-restart-acceptance.json`
- Create: `compatibility/evidence/phase14-upgrade-evidence.json`
- Create: `compatibility/evidence/phase14-runtime-equivalence.json` when final head differs from `RC_RUNTIME_SHA`
- Create: `scripts/phase14/verify-completion.mjs`
- Create: `tests/phase14-completion.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/repository-baseline.yml`
- Modify: `compatibility/matrix.json`
- Regenerate: `docs/compatibility-matrix.md`

**Interfaces:**
- Completion schema: `q1x.phase14-completion-verification.v1`.
- `verifyPhase14Root(root)` returns `{ phase:14, rcVersion:'1.0.0-rc.1', ok, required, acceptedEvidence, findings }`.
- Accepted soak requires >=21,600,000 ms and accepted restart campaign requires >=1,000 cycles.

- [ ] **Step 1: Validate the long-running raw evidence before copying it**

```bash
node -e "const r=require(process.argv[1]); if(r.state!=='passed'||r.requestedMinutes<360||r.elapsedMs<21600000||r.sqliteIntegrity!=='ok'||!r.auditValid||r.externalProviderCalls!==0) process.exit(1)" "$HOME/q1x-phase14-soak-$RC_RUNTIME_SHA.json"
node -e "const r=require(process.argv[1]); if(r.state!=='passed'||r.cyclesCompleted<1000||r.sqliteIntegrity!=='ok'||!r.auditValid||r.externalProviderCalls!==0) process.exit(1)" "$HOME/q1x-phase14-restart-$RC_RUNTIME_SHA.json"
```

- [ ] **Step 2: Prove runtime equivalence when required**

If `git rev-parse HEAD` differs from `RC_RUNTIME_SHA`, run:

```bash
node scripts/phase14/runtime-equivalence.mjs --base "$RC_RUNTIME_SHA" --head "$(git rev-parse HEAD)" --output compatibility/evidence/phase14-runtime-equivalence.json
```

Expected: `equivalent: true`. If false, restart the six-hour soak on the new runtime SHA; do not override the result.

- [ ] **Step 3: Retain raw evidence and hash-based acceptance records**

Copy the raw JSON without machine-specific paths, compute SHA-256, and write acceptance records:

```json
{
  "schema": "q1x.phase14-soak-acceptance.v1",
  "execution": "local-manual",
  "workflowRunId": null,
  "sourceSha": "<RC_RUNTIME_SHA>",
  "artifactPath": "compatibility/evidence/phase14-soak-evidence.json",
  "artifactSha256": "<64 lowercase hex>",
  "minimumMinutes": 360,
  "state": "passed"
}
```

The restart acceptance record mirrors this shape with `minimumCycles: 1000`.

- [ ] **Step 4: Generate retained upgrade evidence on the current exact head**

```bash
node scripts/phase14/run-upgrade-matrix.mjs --source-sha "$(git rev-parse HEAD)" --output compatibility/evidence/phase14-upgrade-evidence.json
```

- [ ] **Step 5: Write the completion RED test first**

Require every design criterion: stable surface, migration/upgrade, package surface, RC identity, docs, dependency evidence, accepted soak/restart, standalone boundary, stable workflows and PolyForm licence.

```js
const report = await verifyPhase14Root(root);
assert.equal(report.schema, 'q1x.phase14-completion-verification.v1');
assert.equal(report.rcVersion, '1.0.0-rc.1');
assert.equal(report.required.acceptedSoakEvidence, true);
assert.equal(report.required.acceptedRestartEvidence, true);
assert.equal(report.required.publicStableWorkflow, true);
assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
```

- [ ] **Step 6: Implement the verifier and wire the final gate**

Verify artifact digests rather than merely file presence. Require soak >=360 minutes, restart >=1,000 cycles, zero external provider calls, SQLite/audit pass, RC package identity, stable docs and stable workflow structural guards.

Then add:

```json
"verify:phase14": "node scripts/phase14/verify-completion.mjs"
```

and append `&& npm run verify:phase14` to root `check`. Add the same verifier to Repository Baseline.

- [ ] **Step 7: Update compatibility identity with evidence honesty**

Set `projectVersion` to `1.0.0-rc.1`. Version-specific tested rows may cite exact RC hosted-runner evidence only after the corresponding CI run exists. Historical evidence remains labelled historical rather than relabelled.

- [ ] **Step 8: Run the complete candidate gate and commit**

```bash
npm ci --no-audit --no-fund
npm run check
npm run test:compatibility
npm run test:resilience
npm run test:stress
npm run test:surface
node --test tests/phase14-*.test.mjs tests/release-stable-governance.test.mjs
node scripts/release/verify-reproducible-packages.mjs "$(git rev-parse HEAD)"
git diff --check
git add compatibility scripts/phase14 tests/phase14-* package.json .github/workflows/repository-baseline.yml docs/compatibility-matrix.md
git commit -m "Phase 14: add stable readiness completion evidence"
git push
```

---

### Task 12: Exact-head review, merge and post-merge RC-readiness verification

**Files:**
- Modify only when exact-head evidence exposes a defect.
- Evidence: GitHub Actions/CodeQL/Pages runs and artifacts for the reviewed head and merged `main` SHA.

**Interfaces:**
- Produces an accepted protected-`main` SHA that is `1.0.0-rc.1` stable-ready.
- Does not create `v1.0.0-rc.1` or `v1.0.0`, and does not publish npm.

- [ ] **Step 1: Open the Phase 14 PR to `main`**

The PR body must link the design/plan, list retained upgrade/soak/restart/surface/dependency evidence, state the known physical-host limitations, and explicitly say stable `1.0.0` remains uncommissioned.

- [ ] **Step 2: Require exact-head GREEN checks**

Require the Phase 13 mandatory set plus Stable Readiness, Phase 14 completion, public-surface/package-surface tests, migration/upgrade tests, CodeQL and independent Q1X review. Reject stale checks from an earlier head SHA.

- [ ] **Step 3: Fix every defect with TDD**

For each deterministic defect: reproduce RED, apply the smallest correction, run the focused gate, push a new commit and wait for exact-head checks again. If a fix changes runtime/product paths, invalidate prior soak equivalence and run a fresh >=6-hour soak.

- [ ] **Step 4: Squash-merge with expected-head guard**

Capture the exact reviewed head SHA and merge only that head. Delete only the completed Phase 14 branch/worktree; do not touch older unrelated worktrees with untracked/ahead state.

- [ ] **Step 5: Verify exact merged `main`**

Freshly run:

```bash
npm ci --no-audit --no-fund
npm run check
npm run test:compatibility
npm run verify:standalone
npm run verify:phase14
node scripts/release/verify-reproducible-packages.mjs "$(git rev-parse HEAD)"
```

Then verify all push-triggered GitHub workflows, CodeQL and Pages are GREEN for the exact merge SHA; live docs must say RC/stable-ready without claiming stable `1.0.0` is released.

- [ ] **Step 6: Validate `public-stable.yml` with mutations disabled**

Dispatch on protected `main` with:

```text
version=1.0.0
release=false
publish_npm=false
```

Verify stable artifacts, external consumer, reproducibility, SBOM/checksums, public surface, dependency inventory and vulnerability gate. Confirm release/npm jobs are skipped.

- [ ] **Step 7: Stop at stable commissioning authority**

Report the accepted `main` SHA, six-hour soak, 1,000-cycle restart evidence, upgrade matrix, RC package identity and validation-only stable bundle. Request explicit separate authority before any `v1.0.0` tag/release. Keep `publish_npm=false` unless separately approved.

---

## Phase 14 Completion Evidence Checklist

- [ ] Public-surface inventory and incompatible-drift gate GREEN.
- [ ] Explicit migration inspect/dry-run/apply/compatibility behavior GREEN.
- [ ] Fresh, Alpha 2 and Phase 13 upgrade matrix GREEN.
- [ ] Failed migration proves transactional rollback/recovery.
- [ ] Backup/restore remains valid across supported upgrade paths.
- [ ] Package/consumer surface snapshot and packed external-consumer gate GREEN.
- [ ] Eight packages aligned at `1.0.0-rc.1` with exact internal dependencies.
- [ ] Deterministic dependency/licence inventory retained.
- [ ] Bounded restart/stress gates GREEN with zero provider billing.
- [ ] Accepted >=6-hour soak retained and digest-verified.
- [ ] Accepted >=1,000-cycle restart/recovery campaign retained and digest-verified.
- [ ] Runtime equivalence proven or long evidence regenerated on final runtime head.
- [ ] Reproducibility, SHA-256 checksums and SPDX 2.3 SBOM GREEN.
- [ ] Stable versioning/deprecation/upgrade/platform/release docs GREEN.
- [ ] CodeQL, compatibility, packaging, product usability, standalone and Phase 14 exact-head gates GREEN.
- [ ] `public-stable.yml` validation-only run GREEN with release/npm jobs skipped.
- [ ] No `v1.0.0-rc.1` or `v1.0.0` tag/release created and no npm publication performed by Phase 14 implementation.
