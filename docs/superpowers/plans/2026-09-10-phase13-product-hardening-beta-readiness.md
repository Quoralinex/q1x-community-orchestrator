# Phase 13 Product Hardening & Beta Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the standalone Q1X Community Orchestrator Alpha 2 baseline into a beta-ready source candidate with proven recovery, bounded execution, resilience evidence, reproducible release artifacts and complete operating manuals.

**Architecture:** Keep the single-node standalone runtime and existing provider-neutral execution seams. Add hardening as focused internal modules around SQLite state/versioning, backup/restore, operation journaling, limits/retry policy, deterministic resilience evidence, release reproducibility and compatibility evidence, then bind all of them into one fail-closed Phase 13 verifier and beta-readiness CI lane.

**Tech Stack:** Node.js 24+, TypeScript 7, `node:sqlite`, Node test runner, JSON/JSON Schema, GitHub Actions, npm workspaces, SHA-256, SPDX JSON SBOM, existing Q1X contracts/SDK/runtime packages.

**Spec:** `docs/superpowers/specs/2026-09-10-product-hardening-beta-readiness-design.md`

## Global Constraints

- Preserve the Phase 12 standalone architecture; no Q1X Control Plane, private Quoralinex service, hosted authority or mandatory cloud dependency.
- Preserve PolyForm Noncommercial License 1.0.0 on every public package and release surface.
- `v0.1.0-alpha.1` and `v0.1.0-alpha.2` are immutable historical release evidence and must never be rewritten.
- Node.js baseline remains `>=24`; root workspace remains private/non-publishable.
- Beta target is `0.2.0-beta.1`; creating the immutable beta tag/release remains a separate explicit commissioning action after Phase 13 passes.
- npm publication remains independently explicit and optional.
- No production failure-injection environment variable or hidden corruption switch.
- External side effects are never assumed idempotent; uncertainty after dispatch is fail-closed.
- PR stress gates must use deterministic local fixtures and no paid provider calls.
- Public claims remain experimental/non-production until separately evidenced.

---
## File Structure

- `packages/runtime/src/state-schema.ts` — durable schema marker, compatibility classification and SQLite integrity helpers.
- `packages/runtime/src/backup.ts` — consistent snapshot creation, manifest hashing, verification and restore-to-empty-target logic.
- `packages/runtime/src/operation-journal.ts` — durable intent/dispatch/result/uncertain state for external side-effect boundaries.
- `packages/runtime/src/runtime-limits.ts` — validated operational ceilings and retry-safety decisions.
- `packages/runtime/src/store.ts` — transaction, busy-timeout, idempotent local-write and operation-journal persistence primitives.
- `packages/runtime/src/runtime.ts` — applies journaling/limits at model, adapter, browser, desktop and execution boundaries.
- `packages/runtime/src/doctor.ts` / `cli.ts` — exposes limits, backup and hardening diagnostics without secrets.
- `scripts/phase13/run-resilience.mjs` — deterministic failure-scenario runner and evidence emitter.
- `scripts/phase13/run-stress.mjs` — bounded PR stress workload.
- `scripts/phase13/run-soak.mjs` — longer manual/scheduled soak workload and evidence.
- `scripts/phase13/verify-completion.mjs` — fail-closed Phase 13 beta-readiness verifier.
- `scripts/release/release-metadata.mjs` — beta-capable release identity and reproducibility metadata.
- `scripts/release/generate-sbom.mjs` — SPDX JSON SBOM generated from the exact workspace/lockfile graph.
- `scripts/release/verify-reproducible-packages.mjs` — compares clean package inventories and unpacked-file digests.
- `compatibility/matrix.json` / `scripts/compatibility/matrix-lib.mjs` — evidence-tier support for fixture, runner and physical-host records.
- `docs/user-guide.md`, `docs/operator-guide.md`, `docs/developer-guide.md`, `docs/cli-reference.md` — consolidated manuals.
- `.github/workflows/beta-readiness.yml` — bounded Phase 13 validation lane.
- `.github/workflows/public-beta.yml` — explicit fail-closed beta commissioning lane, separate from Alpha 2.

---
### Task 1: Durable state schema marker and open-time integrity gate

**Files:**
- Create: `packages/runtime/src/state-schema.ts`
- Modify: `packages/runtime/src/store.ts`
- Modify: `packages/runtime/src/errors.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Test: `tests/runtime-state-version.test.mjs`

**Interfaces:**
- Produces: `CURRENT_STATE_SCHEMA_VERSION = 1`.
- Produces: `classifyStateSchema(version: number): 'current' | 'upgradeable' | 'future'`.
- Produces: `SqliteStore.getStateSchemaVersion(): number`, `SqliteStore.verifyIntegrity(): { ok: boolean; message: string }`.
- `OpenControlRuntime.open()` must reject unsupported future state before exposing normal operations.

- [ ] **Step 1: Write RED state-version tests**

```js
test('new runtime homes persist the current state schema marker', t => {
  const runtime = OpenControlRuntime.open({ home: tempHome(t) });
  assert.equal(runtime.getStateSchemaVersion(), 1);
  runtime.close();
});

test('future state schema fails closed before runtime use', t => {
  const home = tempHome(t);
  seedStateSchema(home, 999);
  assert.throws(() => OpenControlRuntime.open({ home }), error =>
    error.code === 'INCOMPATIBLE_STATE');
});
```
- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/runtime-state-version.test.mjs`

Expected: FAIL because the schema marker/API and `INCOMPATIBLE_STATE` classification do not yet exist.

- [ ] **Step 3: Implement the schema marker and integrity helpers**

```ts
export const CURRENT_STATE_SCHEMA_VERSION = 1;

export function classifyStateSchema(version: number): 'current' | 'upgradeable' | 'future' {
  if (version === CURRENT_STATE_SCHEMA_VERSION) return 'current';
  if (version >= 0 && version < CURRENT_STATE_SCHEMA_VERSION) return 'upgradeable';
  return 'future';
}
```

In `SqliteStore.open()`, create `runtime_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)`, insert `state_schema_version=1` only when absent, set `PRAGMA busy_timeout = 5000`, then reject non-current unsupported state before returning the store. `verifyIntegrity()` must execute `PRAGMA integrity_check` and return `ok` only when the single result is `ok`.

- [ ] **Step 4: Add an Alpha 2 compatibility fixture test**

Create a runtime home with the existing Alpha 2 table layout but no metadata row, reopen it with the new code, assert it is classified as upgradeable/current after the additive marker is installed, and assert existing mission/programme heads remain readable.

- [ ] **Step 5: Run state/store/runtime regressions**

Run: `node --test tests/runtime-state-version.test.mjs tests/runtime-store.test.mjs tests/runtime-checkpoint.test.mjs tests/runtime-security-hardening.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/state-schema.ts packages/runtime/src/store.ts packages/runtime/src/errors.ts packages/runtime/src/runtime.ts tests/runtime-state-version.test.mjs
git commit -m "Phase 13: add durable state compatibility gate"
```
### Task 2: Consistent backup, verification and conservative restore

**Files:**
- Create: `packages/runtime/src/backup.ts`
- Modify: `packages/runtime/src/cli.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/runtime-backup.test.mjs`
- Test: `tests/runtime-backup-cli.test.mjs`

**Interfaces:**
- Produces: `createRuntimeBackup(home: string, outputDir: string): Promise<BackupManifest>`.
- Produces: `verifyRuntimeBackup(path: string): Promise<BackupVerification>`.
- Produces: `restoreRuntimeBackup(path: string, targetHome: string): Promise<BackupManifest>`.
- CLI adds `backup create --output`, `backup verify`, `backup restore <path> --home <empty-target>`.

- [ ] **Step 1: Write RED backup round-trip and corruption tests**

```js
test('backup round-trip preserves state and audit integrity', async t => {
  const source = await seededRuntimeHome(t);
  const backup = await createRuntimeBackup(source, tempDir(t));
  assert.equal((await verifyRuntimeBackup(backup.directory)).valid, true);
  const target = tempDir(t);
  await restoreRuntimeBackup(backup.directory, target);
  assert.equal(SecurityAuditStore.open(target).verify().valid, true);
});

test('restore rejects checksum mismatch and non-empty targets', async t => {
  const backup = await createFixtureBackup(t);
  await corruptOneDurableFile(backup.directory);
  await assert.rejects(() => restoreRuntimeBackup(backup.directory, tempDir(t)), /BACKUP_INTEGRITY_FAILED/);
});
```
- [ ] **Step 2: Run focused backup tests and confirm RED**

Run: `node --test tests/runtime-backup.test.mjs tests/runtime-backup-cli.test.mjs`

Expected: FAIL because the backup module and CLI commands do not yet exist.

- [ ] **Step 3: Implement consistent backup creation**

Use SQLite `VACUUM INTO` (or the Node 24 equivalent supported by `DatabaseSync`) to create a consistent `state.sqlite` snapshot after `PRAGMA integrity_check`, copy only runtime-owned durable files, and write `backup-manifest.json` last. The manifest shape is:

```ts
export interface BackupManifest {
  schema: 'q1x.runtime-backup.v1';
  runtimeVersion: string;
  stateSchemaVersion: number;
  createdAt: string;
  sqliteIntegrity: 'ok';
  sourceIdentity?: { release?: string; sourceSha?: string };
  files: Array<{ path: string; size: number; sha256: string }>;
}
```

Hash relative paths and file bytes with SHA-256; do not include environment values, process environment dumps, user names, host names or absolute source paths.

- [ ] **Step 4: Implement verification and restore-to-empty-target**

`verifyRuntimeBackup()` must reject missing/extra manifest-declared files, digest/size mismatch, unsupported manifest schema, incompatible state schema and failed SQLite integrity. `restoreRuntimeBackup()` must call verification first, require an absent or empty target, copy into a temporary sibling directory and atomically rename only after all checks pass.

- [ ] **Step 5: Wire JSON-first CLI commands**

CLI success objects must include `schema`, `backupPath`, `stateSchemaVersion` and `valid` where applicable. A restore success must instruct the operator, through deterministic fields rather than prose-only output, to run `audit verify`, `recovery reconcile` and `status` before resuming work.

- [ ] **Step 6: Run focused plus CLI regressions and commit**

Run: `node --test tests/runtime-backup.test.mjs tests/runtime-backup-cli.test.mjs tests/runtime-cli.test.mjs tests/runtime-security-cli.test.mjs`

```bash
git add packages/runtime/src/backup.ts packages/runtime/src/cli.ts packages/runtime/src/index.ts tests/runtime-backup.test.mjs tests/runtime-backup-cli.test.mjs
git commit -m "Phase 13: add verified backup and restore"
```
### Task 3: Crash-consistent external operation journal and uncertainty state

**Files:**
- Create: `packages/runtime/src/operation-journal.ts`
- Modify: `packages/runtime/src/store.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/security-extension.ts`
- Modify: `packages/runtime/src/supervision-extension.ts`
- Test: `tests/runtime-operation-journal.test.mjs`
- Test: `tests/runtime-crash-recovery.test.mjs`

**Interfaces:**
- Produces: `OperationJournalEntry` with states `intent-recorded | dispatched | completed | failed | interrupted-uncertain`.
- Produces: `beginOperation()`, `markOperationDispatched()`, `completeOperation()`, `markOperationUncertain()`, `reconcileInterruptedOperations()`.
- Consumers: model, adapter, browser, desktop and supervised execution wrappers.

- [ ] **Step 1: Write RED operation-state tests**

```js
test('dispatched operation without durable result becomes uncertain after restart', async t => {
  const home = tempHome(t);
  const first = OpenControlRuntime.open({ home });
  const op = first.beginExternalOperation({ kind: 'adapter', subjectId: 'adapter.example', retrySafe: false });
  first.markExternalOperationDispatched(op.id);
  first.close();
  const second = OpenControlRuntime.open({ home });
  const [reconciled] = second.reconcileExternalOperations();
  assert.equal(reconciled.state, 'interrupted-uncertain');
});
```

Also test that an `intent-recorded` operation may be retried only when dispatch was never persisted, while a `completed` operation is never duplicated.
- [ ] **Step 2: Run the operation-journal tests and confirm RED**

Run: `node --test tests/runtime-operation-journal.test.mjs tests/runtime-crash-recovery.test.mjs`

Expected: FAIL because no durable external-operation journal exists.

- [ ] **Step 3: Add the internal journal table and atomic transitions**

Add `external_operations` with stable id, kind, subject id, retry-safe flag, state, created/updated timestamps and bounded metadata JSON. Every transition must use `BEGIN IMMEDIATE`, verify the expected prior state and commit or rollback atomically.

```ts
export type ExternalOperationState =
  | 'intent-recorded' | 'dispatched' | 'completed'
  | 'failed' | 'interrupted-uncertain';

export interface OperationJournalEntry {
  id: string;
  kind: 'model' | 'adapter' | 'browser' | 'desktop' | 'supervision';
  subjectId: string;
  retrySafe: boolean;
  state: ExternalOperationState;
}
```

- [ ] **Step 4: Wrap external dispatch boundaries**

For each external runtime call, persist intent before transport invocation, mark `dispatched` immediately before handing control to the transport/backend, and persist `completed`/`failed` only from an observed return/throw. Do not persist prompts, page content, typed desktop values or credentials in journal metadata.

- [ ] **Step 5: Add restart reconciliation**

`reconcileInterruptedOperations()` converts stale `dispatched` entries to `interrupted-uncertain`; `intent-recorded` entries remain retryable according to policy. Emit metadata-only security audit receipts for uncertainty without fabricating a transport result.

- [ ] **Step 6: Add hard process-termination integration coverage**

Spawn a child runtime against a temporary home, inject a test-only transport that sends `ready-to-dispatch` over IPC, terminate the child after the durable `dispatched` transition, reopen the same home and assert exactly one uncertain entry and zero terminal execution result records.

- [ ] **Step 7: Run recovery/security/supervision regressions and commit**

Run: `node --test tests/runtime-operation-journal.test.mjs tests/runtime-crash-recovery.test.mjs tests/runtime-security-hardening.test.mjs tests/runtime-supervision.test.mjs tests/runtime-model-invoke.test.mjs tests/runtime-adapter-execute.test.mjs tests/runtime-browser-runtime.test.mjs tests/runtime-desktop-runtime.test.mjs`

```bash
git add packages/runtime/src/operation-journal.ts packages/runtime/src/store.ts packages/runtime/src/runtime.ts packages/runtime/src/security-extension.ts packages/runtime/src/supervision-extension.ts tests/runtime-operation-journal.test.mjs tests/runtime-crash-recovery.test.mjs
git commit -m "Phase 13: journal uncertain external operations"
```
### Task 4: Concurrency, retry semantics and centralized runtime limits

**Files:**
- Create: `packages/runtime/src/runtime-limits.ts`
- Modify: `packages/runtime/src/store.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/doctor.ts`
- Modify: `packages/runtime/src/cli.ts`
- Test: `tests/runtime-concurrency.test.mjs`
- Test: `tests/runtime-limits.test.mjs`

**Interfaces:**
- Produces: `RuntimeLimits`, `DEFAULT_RUNTIME_LIMITS`, `validateRuntimeLimits()` and `retryDecision()`.
- `RuntimeOpenOptions` gains optional non-secret `limits?: Partial<RuntimeLimits>`.
- CLI adds `q1x limits show`; `doctor --json` exposes effective values and weakening warnings.

- [ ] **Step 1: Write RED validation and contention tests**

```js
test('invalid operational ceilings fail closed', () => {
  assert.throws(() => validateRuntimeLimits({ maxConcurrentAssignments: 0 }), /RESOURCE_LIMIT/);
});

test('competing revisions produce one success and one deterministic conflict', async t => {
  const home = await seededProgrammeHome(t);
  const results = await Promise.allSettled([writeNextRevision(home), writeNextRevision(home)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
});
```
- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/runtime-concurrency.test.mjs tests/runtime-limits.test.mjs`

Expected: FAIL because centralized limits and deterministic contention handling do not yet exist.

- [ ] **Step 3: Implement conservative defaults and validation**

```ts
export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  maxConcurrentAssignments: 4,
  childProcessTimeoutMs: 30_000,
  networkTimeoutMs: 30_000,
  maxResponseBytes: 4 * 1024 * 1024,
  maxBrowserSessions: 4,
  desktopBatchTimeoutMs: 30_000,
  maxSupervisionWorkPerCycle: 50,
  maxRetryAttempts: 3,
  sqliteBusyTimeoutMs: 5_000,
};
```

Reject non-integers, zero/negative values and overrides above these hard ceilings: `maxConcurrentAssignments=32`, `childProcessTimeoutMs=300_000`, `networkTimeoutMs=300_000`, `maxResponseBytes=67_108_864`, `maxBrowserSessions=16`, `desktopBatchTimeoutMs=300_000`, `maxSupervisionWorkPerCycle=1_000`, `maxRetryAttempts=10`, `sqliteBusyTimeoutMs=60_000`. Classify any override above the corresponding conservative default as weakened.

- [ ] **Step 4: Harden store contention and idempotent local writes**

Set SQLite busy timeout from the effective policy. Add content-equivalence checks for stable-id immutable local records: same id plus equivalent content returns the existing durable object; same id plus different content throws `CONFLICT`. Do not make revisioned programme/work-graph updates silently idempotent; competing next revisions remain explicit conflicts.

- [ ] **Step 5: Implement retry decisions**

```ts
export function retryDecision(input: {
  dispatched: boolean; retrySafe: boolean; attempt: number; limits: RuntimeLimits;
}): 'retry' | 'uncertain' | 'stop' {
  if (input.dispatched && !input.retrySafe) return 'uncertain';
  return input.attempt < input.limits.maxRetryAttempts ? 'retry' : 'stop';
}
```

Only no-dispatch failures or explicitly retry-safe operations use bounded retry/backoff. Never retry merely because an external call timed out after dispatch.

- [ ] **Step 6: Expose limits through CLI/doctor and commit**

Run: `node --test tests/runtime-concurrency.test.mjs tests/runtime-limits.test.mjs tests/runtime-doctor.test.mjs tests/runtime-cli.test.mjs`

```bash
git add packages/runtime/src/runtime-limits.ts packages/runtime/src/store.ts packages/runtime/src/runtime.ts packages/runtime/src/doctor.ts packages/runtime/src/cli.ts tests/runtime-concurrency.test.mjs tests/runtime-limits.test.mjs
git commit -m "Phase 13: bound concurrency retries and runtime limits"
```
### Task 5: Deterministic resilience, bounded stress and soak evidence

**Files:**
- Create: `scripts/phase13/run-resilience.mjs`
- Create: `scripts/phase13/run-stress.mjs`
- Create: `scripts/phase13/run-soak.mjs`
- Create: `tests/phase13-resilience.test.mjs`
- Create: `tests/phase13-stress.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces JSON evidence schema `q1x.phase13-resilience-evidence.v1`.
- Produces scenario ids: `transport-timeout`, `connection-refused`, `malformed-response`, `child-nonzero`, `child-hang`, `bridge-overflow`, `browser-termination`, `sqlite-contention`, `backup-corruption`, `restart-supervision`.
- Adds scripts `test:resilience`, `test:stress`, `soak:phase13`.

- [ ] **Step 1: Write RED evidence-shape and bounded-runtime tests**

```js
test('resilience runner emits every required scenario with exact source identity', async () => {
  const report = await runResilience({ sourceSha: TEST_SHA });
  assert.equal(report.schema, 'q1x.phase13-resilience-evidence.v1');
  assert.equal(report.sourceSha, TEST_SHA);
  assert.deepEqual(new Set(report.scenarios.map(x => x.id)), REQUIRED_SCENARIOS);
  assert.ok(report.scenarios.every(x => ['passed', 'failed'].includes(x.state)));
});
```

Stress test must enforce its own elapsed-time ceiling and assert zero unhandled rejections, valid SQLite integrity and valid audit chain at completion.
- [ ] **Step 2: Run focused resilience/stress tests and confirm RED**

Run: `node --test tests/phase13-resilience.test.mjs tests/phase13-stress.test.mjs`

Expected: FAIL because the Phase 13 harnesses do not exist.

- [ ] **Step 3: Implement deterministic failure scenarios**

Each scenario must use injected test transports/backends or temporary SQLite state, never production environment switches. Record exactly:

```js
{
  id,
  state,
  expectedErrorCode,
  observedErrorCode,
  durableStateBefore,
  durableStateAfter,
  restartState,
  durationMs
}
```

A scenario passes only when error classification, durable state and restart state all match the declared expectation.

- [ ] **Step 4: Implement the PR stress workload**

Use deterministic local fixtures to perform at least 1,000 mixed document reads/writes, 100 connector/doctor cycles, 50 supervision/recovery cycles and concurrent CLI access under one fixed 120-second ceiling. The script must fail on SQLite integrity failure, audit-chain failure, uncaught exception, unhandled rejection or elapsed-time breach.

- [ ] **Step 5: Implement the manual/scheduled soak workload**

`run-soak.mjs --minutes <n> --output <file>` repeats init, execution, checkpoint, reconcile, audit verify and state-integrity checks until the requested duration expires. Evidence records iteration count, peak RSS, open-handle count, file-descriptor count where measurable, integrity/audit status and source SHA. No external provider calls are allowed.

- [ ] **Step 6: Wire npm scripts and commit**

Run: `npm run test:resilience && npm run test:stress`

```bash
git add scripts/phase13 tests/phase13-resilience.test.mjs tests/phase13-stress.test.mjs package.json
git commit -m "Phase 13: add resilience stress and soak harnesses"
```
### Task 6: Reproducible package evidence and SPDX SBOM

**Files:**
- Create: `scripts/release/generate-sbom.mjs`
- Create: `scripts/release/verify-reproducible-packages.mjs`
- Modify: `scripts/release/release-metadata.mjs`
- Create: `scripts/release/prepare-prerelease.mjs`
- Preserve unchanged: `scripts/release/prepare-alpha.mjs` for immutable Alpha release regression coverage
- Test: `tests/release-reproducibility.test.mjs`
- Test: `tests/release-beta-governance.test.mjs`

**Interfaces:**
- Produces SPDX JSON document `q1x-community-orchestrator-0.2.0-beta.1.spdx.json`.
- Produces `package-inventory.json` with per-package relative file path, byte size and SHA-256.
- Produces reproducibility report comparing two clean package builds from one source SHA.

- [ ] **Step 1: Write RED reproducibility and SBOM tests**

```js
test('two clean builds have identical unpacked file inventories and digests', async t => {
  const result = await verifyReproduciblePackages({ root, version: '0.2.0-beta.1' });
  assert.equal(result.reproducible, true);
  assert.ok(result.packages.every(pkg => pkg.inventoryMatch));
});

test('SBOM covers every governed public package and lockfile dependency', async () => {
  const sbom = await generateSbom(root);
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.equal(new Set(sbom.packages.map(x => x.name)).has('@quoralinex/q1x-community-runtime'), true);
});
```
- [ ] **Step 2: Run focused release tests and confirm RED**

Run: `node --test tests/release-reproducibility.test.mjs tests/release-beta-governance.test.mjs`

Expected: FAIL because beta release identity, inventory comparison and SBOM generation are absent.

- [ ] **Step 3: Generalize release metadata without mutating Alpha 2**

Accept prerelease identities matching the governed formats already used by the repository, and add `0.2.0-beta.1` as the Phase 13 target. Release metadata must include source SHA, Node version, npm version, lockfile SHA-256, package versions, licence id, package inventories, compatibility evidence baseline and resilience evidence baseline.

- [ ] **Step 4: Implement deterministic unpacked-file inventory comparison**

Implement `prepare-prerelease.mjs` as the version-neutral beta packaging entry point and run two separate clean `npm ci && npm run build && npm pack` operations from the same source tree snapshot; leave `prepare-alpha.mjs` unchanged for historical Alpha commissioning regression coverage. Extract each governed package into isolated directories and compare sorted relative-file paths, byte sizes and SHA-256 digests. Record `.tgz` byte equality separately; never equate archive-metadata variance with unpacked-content variance.

- [ ] **Step 5: Generate SPDX 2.3 JSON from workspace manifests and lockfile**

Use package-lock as the dependency authority. Include package name/version, SPDX license expression where known, dependency relationships and source package paths; never include credentials or environment values.

- [ ] **Step 6: Run existing Alpha 2 governance regressions and commit**

Run: `node --test tests/release-commissioning.test.mjs tests/release-phase12-governance.test.mjs tests/release-reproducibility.test.mjs tests/release-beta-governance.test.mjs`

```bash
git add scripts/release tests/release-reproducibility.test.mjs tests/release-beta-governance.test.mjs
git commit -m "Phase 13: add reproducible beta release evidence"
```
### Task 7: Evidence-tiered compatibility and physical-host records

**Files:**
- Modify: `compatibility/matrix.json`
- Modify: `scripts/compatibility/matrix-lib.mjs`
- Modify: `docs/compatibility-matrix.md`
- Create: `compatibility/evidence/phase13-host-evidence.schema.json`
- Test: `tests/compatibility-matrix.test.mjs`
- Test: `tests/phase13-host-evidence.test.mjs`

**Interfaces:**
- Adds `environmentTier: 'fixture' | 'hosted-runner' | 'physical-host'` to compatibility evidence.
- Physical-host records contain only OS/version, architecture, source/release SHA, relevant bridge/browser version, scenario ids, state and non-sensitive remediation notes.

- [ ] **Step 1: Write RED evidence-tier validation tests**

```js
test('tested compatibility evidence declares its environment tier', () => {
  const matrix = loadMatrix();
  for (const entry of matrix.entries.filter(x => x.status === 'tested')) {
    assert.match(entry.evidence.environmentTier, /^(fixture|hosted-runner|physical-host)$/);
  }
});

test('physical-host evidence rejects hostnames usernames and absolute private paths', () => {
  assert.equal(validateHostEvidence({ ...baseHostEvidence, hostname: 'private-host' }).valid, false);
});
```
- [ ] **Step 2: Run compatibility tests and confirm RED**

Run: `node --test tests/compatibility-matrix.test.mjs tests/phase13-host-evidence.test.mjs`

Expected: FAIL because environment tiers and host-evidence validation are not yet represented.

- [ ] **Step 3: Extend the matrix schema and renderer**

Require an evidence tier on every `tested` entry. Generated markdown must display the tier next to the evidence source and must never render a hosted-runner/harness result as a physical-host claim.

- [ ] **Step 4: Classify existing evidence honestly**

Mark deterministic protocol fixtures as `fixture`, GitHub OS/browser/desktop harness evidence as `hosted-runner`, and add `physical-host` only for evidence actually collected from an available host. Existing macOS permission-blocked evidence remains blocked/runner or physical evidence according to its source rather than being promoted by inference.

- [ ] **Step 5: Add sanitized host-evidence validation and generation rules**

Reject fields or values containing usernames, hostnames, home-directory paths, tokens, credentials or private endpoints. Require exact 40-character source SHA and enumerated `pass | fail | blocked` state.

- [ ] **Step 6: Regenerate the compatibility document and commit**

Run: `npm run test:compatibility && node --test tests/phase13-host-evidence.test.mjs`

```bash
git add compatibility scripts/compatibility docs/compatibility-matrix.md tests/compatibility-matrix.test.mjs tests/phase13-host-evidence.test.mjs
git commit -m "Phase 13: distinguish runner and physical host evidence"
```
### Task 8: User, Operator and Developer manuals with tested CLI reference

**Files:**
- Create: `docs/user-guide.md`
- Create: `docs/operator-guide.md`
- Create: `docs/developer-guide.md`
- Create: `docs/cli-reference.md`
- Create: `scripts/docs/generate-cli-reference.mjs`
- Modify: `README.md`
- Modify: `docs/index.md`
- Test: `tests/phase13-docs.test.mjs`

**Interfaces:**
- `generate-cli-reference.mjs --check` fails when checked-in command reference differs from executable CLI help/command catalogue.
- Manuals remain task-oriented and must not require design-doc reconstruction for ordinary operation.

- [ ] **Step 1: Write RED documentation contract tests**

```js
test('manual set covers install use operate recover and extend', async () => {
  for (const file of ['user-guide.md', 'operator-guide.md', 'developer-guide.md', 'cli-reference.md']) {
    assert.equal(await exists(`docs/${file}`), true);
  }
  const operator = await read('docs/operator-guide.md');
  assert.match(operator, /backup create/i);
  assert.match(operator, /backup restore/i);
  assert.match(operator, /audit verify/i);
  assert.match(operator, /recovery reconcile/i);
});
```
- [ ] **Step 2: Run documentation tests and confirm RED**

Run: `node --test tests/phase13-docs.test.mjs`

Expected: FAIL because the consolidated manuals and generated CLI reference do not yet exist.

- [ ] **Step 3: Generate the CLI reference from executable command metadata**

Do not scrape free-form terminal output with fragile regex if command definitions can be exported directly. Add a deterministic command catalogue export in `cli.ts` if needed, then render command, required arguments, optional flags and one-line purpose. `--check` compares generated bytes with `docs/cli-reference.md`.

- [ ] **Step 4: Write the User Guide**

Cover source/release installation, first run, connector setup, local/hosted model profiles, MCP/A2A/CLI tools, browser and first-party desktop bridges, mission/programme execution, `doctor`, clean shutdown/restart and common blocked diagnostics. Every copyable command must correspond to a tested CLI surface.

- [ ] **Step 5: Write the Operator Guide**

Cover runtime home, state schema, limits, backup create/verify/restore, post-restore audit/recovery/status sequence, upgrade/rollback, release checksum/SBOM verification, compatibility evidence tiers, uncertain execution triage, incident handling and soak evidence.

- [ ] **Step 6: Write the Developer Guide and link all manuals**

Cover repository architecture, contracts/SDKs, adapter conformance, deterministic fixtures, resilience harness, compatibility evidence, release governance, contribution workflow and the no-private-service boundary. Link all four manuals from README and Pages index.

- [ ] **Step 7: Run docs/claims/standalone checks and commit**

Run: `node scripts/docs/generate-cli-reference.mjs --check && node --test tests/phase13-docs.test.mjs tests/phase12-claims.test.mjs && npm run verify:standalone`

```bash
git add docs README.md scripts/docs tests/phase13-docs.test.mjs
git commit -m "Phase 13: add user operator and developer manuals"
```
### Task 9: Phase 13 completion verifier and beta-readiness CI lane

**Files:**
- Create: `scripts/phase13/verify-completion.mjs`
- Create: `.github/workflows/beta-readiness.yml`
- Modify: `.github/workflows/repository-baseline.yml`
- Modify: `package.json`
- Create: `tests/phase13-completion.test.mjs`
- Modify: `tests/packaging.test.mjs`

**Interfaces:**
- Adds `npm run verify:phase13` and includes it in `npm run check` only after all preceding tasks are GREEN.
- Completion report schema: `q1x.phase13-completion-verification.v1`.
- Beta-readiness workflow uploads resilience, stress, reproducibility, SBOM and compatibility evidence artifacts from the exact head SHA.

- [ ] **Step 1: Write RED completion-contract tests**

```js
test('Phase 13 completion verifier requires every hardening evidence surface', async () => {
  const report = await verifyPhase13(root);
  assert.equal(report.schema, 'q1x.phase13-completion-verification.v1');
  assert.equal(report.betaVersion, '0.2.0-beta.1');
  assert.equal(report.required.stateVersioning, true);
  assert.equal(report.required.backupRestore, true);
  assert.equal(report.required.operationJournal, true);
  assert.equal(report.required.resilienceEvidence, true);
  assert.equal(report.required.manuals, true);
});
```
- [ ] **Step 2: Run completion tests and confirm RED**

Run: `node --test tests/phase13-completion.test.mjs`

Expected: FAIL until every required Phase 13 evidence surface exists.

- [ ] **Step 3: Implement fail-closed structural/evidence verification**

The verifier must check package/version alignment, state schema marker, backup APIs/CLI, operation journal states, limits command/doctor output, required resilience scenario ids, stress/soak evidence schema, reproducibility/SBOM scripts, compatibility evidence tiers, all four manuals, PolyForm licence and standalone verifier success. It must return `ok: false` plus explicit finding ids rather than throwing on a missing optional file.

- [ ] **Step 4: Add bounded beta-readiness workflow**

Use Ubuntu 24.04, Node 24 and full-SHA-pinned actions. Run `npm ci`, build, normal check suite, `test:resilience`, `test:stress`, release reproducibility/SBOM generation and `verify:phase13`. Upload machine-readable evidence. Do not run the long soak on every PR.

- [ ] **Step 5: Add manual/scheduled soak job**

Add `workflow_dispatch` inputs `minutes` and a low-frequency schedule no more often than weekly. The job runs only deterministic local fixtures, uploads its evidence artifact and has read-only repository permissions.

- [ ] **Step 6: Wire Repository Baseline assertions**

Packaging tests must require pinned actions, read-only normal-job permissions, Node 24, deterministic evidence filenames and absence of secrets/provider credentials. Repository Baseline must run `verify:phase13` after the implementation is complete.

- [ ] **Step 7: Run the complete local gate and commit**

Run: `npm ci --no-audit --no-fund && npm run check && npm run test:compatibility && npm run test:resilience && npm run test:stress && git diff --check`

```bash
git add scripts/phase13 .github/workflows/beta-readiness.yml .github/workflows/repository-baseline.yml package.json tests/phase13-completion.test.mjs tests/packaging.test.mjs
git commit -m "Phase 13: add beta readiness completion gate"
```
### Task 10: Governed `0.2.0-beta.1` candidate and final Phase 13 acceptance

**Files:**
- Create: `.github/workflows/public-beta.yml`
- Modify: governed package `package.json` files under `packages/*`
- Modify: `scripts/release/release-metadata.mjs`
- Modify: `docs/roadmap.md`
- Modify: `docs/known-limitations.md`
- Create: `docs/prerelease.md`
- Preserve unchanged: `docs/public-alpha.md` as historical Alpha documentation
- Modify: `docs/index.md`
- Test: `tests/release-beta-governance.test.mjs`
- Test: `tests/phase13-claims.test.mjs`

**Interfaces:**
- Eight public packages are version-aligned at `0.2.0-beta.1` with exact internal dependency versions.
- `public-beta.yml` has `workflow_dispatch` release authority separate from optional `publish_npm` authority.
- Existing Alpha 1 and Alpha 2 release/tag checks remain immutable regression requirements.

- [ ] **Step 1: Write RED beta identity and public-claim tests**

```js
test('beta candidate governs all eight public packages at one exact version', async () => {
  const packages = await governedPackages(root);
  assert.ok(packages.every(pkg => pkg.version === '0.2.0-beta.1'));
  assert.ok(exactInternalDependencies(packages));
});

test('public docs call source beta-ready only after Phase 13 gate and do not claim a beta release exists', async () => {
  const docs = await activePublicDocs();
  assert.doesNotMatch(docs, /current commissioned beta/i);
  assert.match(docs, /v0\.1\.0-alpha\.2.*commissioned/is);
});
```
- [ ] **Step 2: Run beta-governance tests and confirm RED**

Run: `node --test tests/release-beta-governance.test.mjs tests/phase13-claims.test.mjs`

Expected: FAIL because package versions and beta release authority are still Alpha 2-era.

- [ ] **Step 3: Align all governed packages to `0.2.0-beta.1`**

Update contracts, SDK, Adapter SDK, desktop bridge common/macOS/Windows/Linux and runtime package versions together. Every internal `@quoralinex/q1x-community-*` dependency must use exact `0.2.0-beta.1`; update package-lock deterministically with npm 11 on Node 24 and verify Alpha 2 tags/releases remain untouched.

- [ ] **Step 4: Add fail-closed public beta commissioning workflow**

`public-beta.yml` accepts `version` and booleans `release` and `publish_npm`. Validation always runs first. Release creation is permitted only when `release=true`, ref is protected `main`, requested version equals `0.2.0-beta.1`, every package/reproducibility/SBOM/resilience/compatibility gate is GREEN and the tag does not exist at another SHA. npm runs only when `publish_npm=true` and trusted-publishing authority succeeds.

- [ ] **Step 5: Produce one accepted soak evidence record**

Run the manual/scheduled soak lane for exactly 60 minutes for the first beta-readiness acceptance record; later evidence may run longer but never shorter than 60 minutes. Store the workflow run id/source SHA and artifact digest in the Phase 13 evidence record; do not commit machine-specific host secrets or temporary runtime state.

- [ ] **Step 6: Run physical-host evidence where available**

Exercise the first-party desktop doctor/control and browser flow on available macOS/Windows/Linux hosts. Record only sanitized evidence allowed by Task 7. A blocked host remains honestly blocked and does not prevent beta readiness when the corresponding runner/harness baseline is GREEN and the limitation is documented.

- [ ] **Step 7: Run complete candidate verification**

Run: `npm ci --no-audit --no-fund && npm run check && npm run test:compatibility && npm run test:resilience && npm run test:stress && npm run verify:phase13 && node scripts/release/verify-reproducible-packages.mjs && git diff --check`

Expected: every gate PASS, with `v0.1.0-alpha.2` still the current commissioned release and `0.2.0-beta.1` described only as a beta-ready candidate.

- [ ] **Step 8: Commit the governed beta candidate**

```bash
git add packages package-lock.json .github/workflows/public-beta.yml scripts/release docs tests/release-beta-governance.test.mjs tests/phase13-claims.test.mjs
git commit -m "Phase 13: prepare governed beta candidate"
```
### Task 11: Exact-head review, merge and post-merge beta-readiness commissioning evidence

**Files:**
- Modify only if evidence reveals defects; do not add cosmetic scope during closeout.
- Evidence: GitHub Actions runs/artifacts for the exact candidate and merged `main` SHA.

**Interfaces:**
- Produces accepted protected-`main` SHA that is structurally Phase-13-complete and beta-ready.
- Does **not** create `v0.2.0-beta.1`; that immutable release remains the next explicit commissioning boundary.

- [ ] **Step 1: Push the implementation branch and open one Phase 13 PR**

Use the accumulated task commits, target `main`, and include the design/spec path, implementation-plan path, evidence artifact names, known limitations and explicit statement that Alpha 2 remains the current commissioned release until separate beta commissioning.

- [ ] **Step 2: Verify exact-head mandatory checks**

Require GREEN on Repository Baseline, Runtime and Contracts, CodeQL, Compatibility Matrix, Cross-platform Packaging, Product Usability, Beta Readiness, standalone verification, Phase 13 completion verification and Q1X Goose independent review. Reject stale check results from an earlier head SHA.

- [ ] **Step 3: Resolve every review thread or defect through a new tested commit**

For any defect, reproduce with a failing test, implement the minimal correction, rerun the affected focused suite and then the exact-head required checks. Do not merge with unresolved threads or a moved/unverified head.

- [ ] **Step 4: Squash-merge with expected-head guard**

Use the exact reviewed PR head SHA as the merge guard. Capture the resulting `main` SHA and delete only the completed Phase 13 feature branch after merge.

- [ ] **Step 5: Verify the exact merged `main` SHA**

Wait for all push-triggered mandatory workflows and Pages deployment to complete. Confirm `main` equals the merge result, `npm run verify:standalone` and `npm run verify:phase13` remain GREEN locally, and public docs say `beta-ready` without claiming an immutable beta has been released.

- [ ] **Step 6: Stop at beta release authority**

Report the accepted `main` SHA, soak evidence, compatibility/reliability evidence, package version and release-artifact readiness. Request explicit authority before dispatching `public-beta.yml` with `release=true`; keep `publish_npm=false` unless separately approved.

---

## Completion Evidence Checklist

- [ ] State schema/version and Alpha 2 upgrade fixture GREEN.
- [ ] Backup create/verify/restore and post-restore audit/recovery GREEN.
- [ ] Crash/uncertainty journal proves no fabricated completion or unsafe automatic replay.
- [ ] Concurrency, lock timeout, retry and operational ceilings GREEN.
- [ ] Required resilience scenarios GREEN with machine-readable evidence.
- [ ] Bounded stress gate GREEN and accepted >=60-minute soak evidence retained.
- [ ] Reproducible unpacked package inventories/digests and SPDX SBOM GREEN.
- [ ] Compatibility matrix distinguishes fixture, hosted-runner and physical-host evidence.
- [ ] User, Operator, Developer and generated CLI manuals GREEN.
- [ ] Eight packages aligned at `0.2.0-beta.1`; Alpha 1/Alpha 2 remain immutable.
- [ ] Exact-head and post-merge CI/CodeQL/Goose/Pages GREEN.
- [ ] `verify:standalone` and `verify:phase13` return `ok: true` on accepted `main`.
- [ ] No beta tag/release created without the separate commissioning approval.
