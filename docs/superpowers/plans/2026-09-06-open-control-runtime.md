# Phase 2 Open Control Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a restart-safe, single-node orchestration runtime with SQLite persistence, semantic validation, execution records, programme checkpoints and a scriptable `q1x` CLI.

**Architecture:** `packages/runtime` owns a Node 24+ SQLite persistence layer and the OpenControlRuntime service. Phase 1 schemas remain normative; runtime validators add cross-document and lifecycle rules. The CLI is a thin JSON interface over the same runtime API.

**Tech Stack:** Node.js 24+, TypeScript 7, built-in `node:sqlite`, AJV 8, Node test runner, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-06-open-control-runtime-design.md`

## Global Constraints

- JSON Schema 2020-12 remains normative for public contract structure.
- Runtime package requires Node.js 24+; contracts and SDK stay independently consumable.
- Default home is `~/.q1x-community-orchestrator`; `Q1X_HOME` and `--home` override it.
- No hosted service, AI provider, external database, network listener or paid dependency.
- All SQL uses bound parameters and multi-table mutations are transactional.
- Phase 1 tests, distribution checks, CodeQL and repository baseline remain mandatory.

---
### Task 1: Runtime package, schema access and typed errors

**Files:**
- Modify: `package.json`, `tsconfig.json`, `packages/contracts/package.json`
- Create: `packages/runtime/package.json`, `packages/runtime/tsconfig.json`, `packages/runtime/LICENSE`
- Create: `packages/runtime/src/errors.ts`, `packages/runtime/src/schema-loader.ts`, `packages/runtime/src/index.ts`
- Test: `tests/runtime-schema.test.mjs`

**Interfaces:**
- Produces: `RuntimeError`, `loadContractSchemas()`, `validateContract(schemaId, value)`.
- Consumes: Phase 1 schema ids and packaged schema JSON files.

- [ ] **Step 1: Write a failing test that imports the runtime dist package and validates a valid mission while rejecting a malformed one with `SCHEMA_INVALID`.**

```js
const runtime = await import('../packages/runtime/dist/index.js');
assert.equal(runtime.validateContract(SCHEMA_IDS.mission, validMission), validMission);
assert.throws(() => runtime.validateContract(SCHEMA_IDS.mission, badMission), e => e.code === 'SCHEMA_INVALID');
```

- [ ] **Step 2: Run `npm run build && node --test tests/runtime-schema.test.mjs`; verify RED because the runtime package does not exist.**
- [ ] **Step 3: Add the runtime workspace, Node 24 engine, schema subpath export and minimal AJV loader/error implementation.**
- [ ] **Step 4: Re-run the focused test and the existing Phase 1 test suite; verify GREEN.**
- [ ] **Step 5: Commit `feat: bootstrap open control runtime`.**

### Task 2: SQLite versioned document store

**Files:**
- Create: `packages/runtime/src/home.ts`, `packages/runtime/src/store.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/runtime-store.test.mjs`

**Interfaces:**
- Produces: `resolveRuntimeHome(input?)`, `SqliteStore.open(home)`, `putDocument()`, `getDocument()`, `listDocuments()`, `getHeadRevision()`, `appendEvent()`, `close()`.
- Stores immutable versions plus current head pointers and programme scope.

- [ ] **Step 1: Write tests using `mkdtemp()` that put two versions, read only the latest head, list current documents, close/reopen the store and recover the same data.**

```js
store.putDocument({ kind: 'mission', id: 'm1', scopeId: null, document: first });
store.putDocument({ kind: 'mission', id: 'm1', scopeId: null, document: second });
assert.equal(store.getHeadRevision('mission', 'm1'), 2);
assert.deepEqual(store.getDocument('mission', 'm1'), second);
```

- [ ] **Step 2: Run the focused test; verify RED because `SqliteStore` is missing.**
- [ ] **Step 3: Implement migrations for `document_versions`, `document_heads`, `checkpoints` and `runtime_events`, using prepared statements and transactions.**
- [ ] **Step 4: Verify focused tests pass after a full close/reopen cycle and run `git diff --check`.**
- [ ] **Step 5: Commit `feat: add versioned sqlite state store`.**

### Task 3: Semantic validators and lifecycle rules

**Files:**
- Create: `packages/runtime/src/graph-validation.ts`, `packages/runtime/src/lifecycle.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/runtime-semantics.test.mjs`

**Interfaces:**
- Produces: `validateGraphStructure(graph)`, `assertTransition(kind, from, to)`, `assertNextContractRevision(previous, next)`.
- Consumes: Phase 1 mission, programme and work-graph SDK types.

- [ ] **Step 1: Write RED tests for missing edge endpoints, missing parent nodes, dependency cycles, revision gaps and illegal terminal-state transitions.**

```js
assert.throws(() => validateGraphStructure(cyclicGraph), e => e.code === 'GRAPH_CYCLE');
assert.throws(() => assertNextContractRevision(1, 3), e => e.code === 'INVALID_REVISION');
assert.throws(() => assertTransition('mission', 'completed', 'active'), e => e.code === 'INVALID_TRANSITION');
```

- [ ] **Step 2: Run the focused test and confirm each failure is due to missing semantic functions.**
- [ ] **Step 3: Implement only the explicit lifecycle tables, revision increment rule and execution-dependency cycle detector from the design.**
- [ ] **Step 4: Run focused tests plus the Phase 1 contract tests; verify GREEN.**
- [ ] **Step 5: Commit `feat: enforce runtime semantic rules`.**

### Task 4: Mission, programme, work-graph and replanning runtime service

**Files:**
- Create: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/runtime-service.test.mjs`

**Interfaces:**
- Produces: `OpenControlRuntime.open({ home? })`, `putMission`, `getMission`, `listMissions`, `putProgramme`, `getProgramme`, `listProgrammes`, `putWorkGraph`, `getWorkGraph`, `recordReplanEvent`, `close`.
- Consumes: schema validator, semantic validators and `SqliteStore`.

- [ ] **Step 1: Write RED integration tests that persist a mission, reject a programme whose mission is absent, enforce programme revision increments, persist a work graph and reject a graph whose programme is absent.**

```js
const runtime = OpenControlRuntime.open({ home });
runtime.putMission(mission);
assert.deepEqual(runtime.getMission(mission.id), mission);
assert.throws(() => runtime.putProgramme(orphanProgramme), e => e.code === 'INVALID_REFERENCE');
```

- [ ] **Step 2: Run the focused integration tests and verify RED.**
- [ ] **Step 3: Implement the service methods with schema validation before transactional persistence and append audit events after successful writes.**
- [ ] **Step 4: Add an update test proving mission/programme/work-node transitions are checked against the current version.**
- [ ] **Step 5: Run all runtime tests and commit `feat: persist orchestration programme state`.**

### Task 5: Execution request/result lifecycle

**Files:**
- Modify: `packages/runtime/src/runtime.ts`, `packages/runtime/src/store.ts`, `packages/runtime/src/index.ts`
- Test: `tests/runtime-execution.test.mjs`

**Interfaces:**
- Produces: `recordExecutionRequest(request)`, `getExecutionRequest(id)`, `recordExecutionResult(result)`, `getExecutionResult(requestId)`.
- Execution documents inherit programme scope from the referenced work item.

- [ ] **Step 1: Write RED tests proving requests fail for unknown or terminal work items and results fail for unknown requests, work-item mismatch and duplicate completion.**

```js
assert.throws(() => runtime.recordExecutionRequest(unknownWorkItemRequest), e => e.code === 'INVALID_REFERENCE');
runtime.recordExecutionRequest(request);
runtime.recordExecutionResult(result);
assert.throws(() => runtime.recordExecutionResult(result), e => e.code === 'EXECUTION_CONFLICT');
```

- [ ] **Step 2: Run the focused test and confirm RED at the missing execution methods.**
- [ ] **Step 3: Add work-item lookup, programme-scope inheritance and immutable request/result persistence.**
- [ ] **Step 4: Close and reopen the runtime and verify request/result state survives process restart.**
- [ ] **Step 5: Run all runtime tests and commit `feat: record execution lifecycle state`.**

### Task 6: Programme checkpoints, restore and status

**Files:**
- Modify: `packages/runtime/src/store.ts`, `packages/runtime/src/runtime.ts`, `packages/runtime/src/index.ts`
- Test: `tests/runtime-checkpoint.test.mjs`

**Interfaces:**
- Produces: `createCheckpoint(programmeId, checkpointId?)`, `listCheckpoints(programmeId?)`, `restoreCheckpoint(checkpointId)`, `getStatus(programmeId?)`.
- Store adds `captureScopeHeads(scopeId)` and `restoreScopeHeads(scopeId, snapshot)` transactionally.

- [ ] **Step 1: Write RED tests that checkpoint revision 1, write revision 2 plus an execution record, restore the checkpoint, then reopen the runtime and observe revision 1 with post-checkpoint heads removed.**

```js
const checkpoint = runtime.createCheckpoint(programme.id, 'cp-1');
runtime.putWorkGraph(graphRevision2);
runtime.restoreCheckpoint(checkpoint.id);
assert.equal(runtime.getWorkGraph(graph.id).revision, 1);
```

- [ ] **Step 2: Verify RED because checkpoint APIs are absent.**
- [ ] **Step 3: Implement snapshot capture/restore inside SQLite transactions; preserve immutable versions and append restore audit events.**
- [ ] **Step 4: Implement status counts and tests for global and programme-filtered summaries.**
- [ ] **Step 5: Run restart/recovery tests and commit `feat: add programme checkpoint recovery`.**

### Task 7: Scriptable `q1x` CLI

**Files:**
- Create: `packages/runtime/src/cli.ts`
- Modify: `packages/runtime/package.json`
- Test: `tests/runtime-cli.test.mjs`

**Interfaces:**
- Produces: `q1x` bin with `init`, `status`, mission/programme/graph, replan, execution and checkpoint commands from the design.
- Consumes: `OpenControlRuntime`; CLI contains no independent persistence rules.

- [ ] **Step 1: Write RED child-process tests for `q1x init`, mission put/list/show, programme put, graph put, checkpoint create/restore and structured error exit.**

```js
const run = spawnSync(process.execPath, [cli, '--home', home, 'mission', 'put', '--file', missionFile], { encoding: 'utf8' });
assert.equal(run.status, 0);
assert.equal(JSON.parse(run.stdout).id, mission.id);
```

- [ ] **Step 2: Run the focused CLI test and verify RED because the executable is absent.**
- [ ] **Step 3: Implement argument parsing without a framework, JSON file loading, JSON stdout and structured `RuntimeError` stderr.**
- [ ] **Step 4: Add an npm package bin entry and verify the packed runtime contains `dist/cli.js`, licence and README.**
- [ ] **Step 5: Run CLI plus runtime integration tests and commit `feat: add q1x control runtime cli`.**

### Task 8: CI, documentation and distribution hardening

**Files:**
- Modify: `package.json`, `.github/workflows/contracts-ci.yml`, `README.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/roadmap.md`, `docs/_layouts/default.html`
- Create: `docs/runtime.md`, `packages/runtime/README.md`
- Modify/Test: `tests/dist-contracts.test.mjs`

**Interfaces:**
- Extends repository `npm run check` to include all Phase 2 runtime tests and runtime package distribution checks.
- Publishes no package; only proves the package is ready to distribute later.

- [ ] **Step 1: Write a RED distribution assertion that `packages/runtime/LICENSE`, README, bin declaration and runtime package metadata are present and aligned.**
- [ ] **Step 2: Update repository scripts so `npm run check` builds all workspaces and runs Phase 1 plus all Phase 2 tests.**
- [ ] **Step 3: Extend GitHub Actions to use Node 24 and dry-pack contracts, SDK and runtime packages.**
- [ ] **Step 4: Document runtime architecture, Node 24 requirement, CLI examples, checkpoint semantics and roadmap completion without describing the repository as production-ready.**
- [ ] **Step 5: Run a clean `npm ci`, `npm run check`, `npm audit --audit-level=high`, three `npm pack --dry-run` commands, private-tool leakage scan and `git diff --check`.**
- [ ] **Step 6: Commit `docs: complete Phase 2 runtime delivery`, push the branch, open a PR, wait for required GitHub checks, squash merge, then repeat clean verification on merged `main`.**

## Completion evidence

Do not report Phase 2 complete from local results alone. Completion requires the merged `main` SHA plus successful post-merge `repository-baseline`, `contracts-ci`, CodeQL and GitHub Pages runs.
