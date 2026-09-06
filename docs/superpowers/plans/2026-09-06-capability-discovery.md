# Phase 3 Capability Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manifest-driven, OS-neutral capability discovery and a persistent live registry to the Open Control Runtime.

**Architecture:** Extend the normative v1 contracts with `DiscoveryManifest`; use the existing versioned SQLite store for capabilities/adapters; implement generic probes without vendor hard-coding; expose discovery and registry through the existing JSON-first CLI.

**Tech Stack:** Node.js 24+, TypeScript 7, JSON Schema 2020-12, AJV, built-in `node:sqlite`, `child_process`, `fetch`, filesystem APIs.

**Spec:** `docs/superpowers/specs/2026-09-06-capability-discovery-design.md`

## Global Constraints

- No provider, vendor, paid API or cloud account is mandatory.
- Core discovery contains no AI product/model names.
- Environment values, tokens, cookies and authorization headers are never emitted or persisted.
- Commands execute without a shell and with bounded timeouts.
- Existing Phase 1 contracts remain backward compatible.
- Existing Phase 2 runtime state remains readable.

---### Task 1: Discovery contract and SDK types

**Files:**
- Create: `packages/contracts/schemas/v1/discovery-manifest.schema.json`
- Modify: `packages/contracts/src/index.ts`, `packages/sdk-typescript/src/capability.ts`
- Test: `tests/schema-contracts.test.mjs`, `tests/sdk-types.test.ts`, `tests/dist-contracts.test.mjs`

**Interfaces:**
- Produces `DiscoveryManifest`, `DiscoveryProbe`, `CapabilityTemplate`, and `SCHEMA_IDS.discoveryManifest`.

- [ ] Write failing schema/catalog/type tests requiring the new contract.
- [ ] Run `npm run build && npm test && npm run test:types && npm run test:dist`; confirm RED due to the absent contract/type.
- [ ] Add the JSON Schema and matching TypeScript reference types.
- [ ] Add the schema to the contract loader/catalog while preserving v1 compatibility.
- [ ] Re-run the focused tests and commit `feat: add discovery manifest contract`.

### Task 2: Persistent capability and adapter registry

**Files:**
- Modify: `packages/runtime/src/runtime.ts`, `packages/runtime/src/index.ts`
- Test: `tests/runtime-registry.test.mjs`

**Interfaces:**
- Produces `put/get/listCapability` and `put/get/listAdapterManifest` on `OpenControlRuntime`.

- [ ] Write RED tests for validation, restart persistence and deterministic listing.
- [ ] Implement registry methods using existing versioned SQLite documents with global scope.
- [ ] Emit audit events on registry changes.
- [ ] Run the runtime suite and commit `feat: add persistent capability registry`.### Task 3: Generic filesystem, environment and command probes

**Files:**
- Create: `packages/runtime/src/discovery.ts`
- Test: `tests/runtime-discovery.test.mjs`

**Interfaces:**
- Produces `runProbe(probe, context)` and `discoverManifest(manifest, context)`.

- [ ] Write RED tests using temporary files/directories, temporary executable scripts and temporary environment keys.
- [ ] Prove command probes resolve via PATH, path probes expand `~`, environment probes disclose presence only, and platform-inapplicable probes are skipped.
- [ ] Implement command execution with `spawnSync`/`execFileSync` semantics and no shell, bounded by the manifest timeout.
- [ ] Implement `any` and `all` activation and capability availability/trust derivation.
- [ ] Run tests and commit `feat: add local capability probes`.

### Task 4: HTTP probe and runtime discovery orchestration

**Files:**
- Modify: `packages/runtime/src/discovery.ts`, `packages/runtime/src/runtime.ts`
- Test: `tests/runtime-discovery-http.test.mjs`

**Interfaces:**
- Produces asynchronous `discover(manifest)` and `discoverMany(manifests)` runtime APIs.

- [ ] Write RED tests with a loopback HTTP server for accepted status, timeout/failure isolation and no secret leakage.
- [ ] Implement GET/HEAD HTTP probes with `AbortSignal.timeout` and accepted status codes.
- [ ] Persist produced capabilities and discovery audit metadata through the registry.
- [ ] Verify one failed probe does not crash an `any` manifest and commit `feat: add live discovery orchestration`.### Task 5: Manifest loading and CLI surfaces

**Files:**
- Create: `packages/runtime/src/discovery-loader.ts`
- Modify: `packages/runtime/src/cli.ts`, `packages/runtime/src/index.ts`
- Test: `tests/runtime-discovery-cli.test.mjs`

**Interfaces:**
- Produces deterministic `loadDiscoveryManifests(path)` plus CLI commands `discover`, `capabilities list/get`, and `adapters list`.

- [ ] Write RED tests for single-file and directory loading and CLI registry round trips.
- [ ] Load only `*.discovery.json` files from directories, sorted lexically; validate every manifest before execution.
- [ ] Add JSON CLI responses and structured errors consistent with Phase 2.
- [ ] Verify registry state survives separate CLI invocations and commit `feat: expose capability discovery cli`.

### Task 6: Public examples, docs, CI and distribution hardening

**Files:**
- Create: `examples/discovery/*.discovery.json`, `docs/discovery.md`
- Modify: `README.md`, `docs/index.md`, `docs/architecture.md`, `docs/roadmap.md`, `packages/runtime/README.md`, `.github/workflows/contracts-ci.yml`, `tests/dist-contracts.test.mjs`

**Interfaces:**
- Produces user-facing manifest examples and a complete Phase 3 verification gate.

- [ ] Add provider-neutral examples for command, local HTTP and desktop/path discovery.
- [ ] Add tests ensuring examples validate and package/distribution files include the discovery surface.
- [ ] Update Pages/README without private Q1X or company-specific tooling.
- [ ] Run clean `npm ci`, `npm run check`, `npm audit --audit-level=high`, package dry-runs, private-tool leak scan and `git diff --check`.
- [ ] Commit `docs: complete Phase 3 capability discovery`, push PR, wait for required GitHub checks, squash merge, verify merged `main`, then continue to Phase 4.