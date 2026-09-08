# Phase 12 Connector Catalogue & Doctor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make baseline Q1X integrations discoverable, configurable, testable and diagnosable without editing internal files or writing connector code.

**Architecture:** Add a deterministic first-party connector catalogue under `connectors/`, a runtime catalogue service, persisted non-secret enable/configuration state, and JSON-first CLI commands. `q1x doctor` composes runtime, connector, model, browser, adapter and desktop preflight checks while never exposing secret values.

**Tech Stack:** Node.js 24 ESM, TypeScript, JSON manifests, existing SQLite runtime state, existing endpoint registries and compatibility matrix.

**Spec:** `docs/superpowers/specs/2026-09-09-core-usability-ecosystem-design.md`

## Global Constraints

- Catalogue content is repository-owned and declarative.
- No arbitrary package download or auto-execution.
- Secret values are never persisted or printed.
- Commands are non-interactive and machine-readable by default.
- Diagnostic states are exactly `ok`, `warning`, `blocked`, `unsupported`, `not-configured`.
- Existing endpoint/security validation remains authoritative.

---

### Task 1: Connector manifest contract and first-party catalogue loader

**Files:**
- Create: `connectors/schema/connector.schema.json`
- Create: `connectors/catalogue.json`
- Create: `packages/runtime/src/connectors/types.ts`
- Create: `packages/runtime/src/connectors/catalogue.ts`
- Create: `tests/connectors-catalogue.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `ConnectorCategory = 'model'|'mcp'|'a2a'|'cli'|'browser'|'desktop'`.
- `ConnectorProvenance = 'first-party'|'community'`.
- `ConnectorDefinition` contains id/name/category/protocol/platforms/requirements/profile/compatibility/provenance.
- `loadBuiltInConnectorCatalogue(): readonly ConnectorDefinition[]`.

- [ ] Write RED tests for schema closure, duplicate ids, deterministic sort, forbidden embedded secret values and invalid protocol/category/platform values.
- [ ] Implement strict manifest validation and deterministic loader.
- [ ] Seed only connector definitions that have an implementation path in this phase; do not create aspirational entries.
- [ ] Run schema/runtime tests and commit.

---

### Task 2: Connector configuration persistence

**Files:**
- Create: `packages/runtime/src/connectors/store.ts`
- Create: `packages/runtime/src/connectors/configuration.ts`
- Create: `tests/runtime-connectors-store.test.mjs`
- Modify: `packages/runtime/src/runtime.ts`

**Interfaces:**
- `ConfiguredConnector { id, enabled, profile, parameters, environmentKeys, updatedAt }`.
- `putConfiguredConnector`, `getConfiguredConnector`, `listConfiguredConnectors`, `setConnectorEnabled`.

- [ ] RED tests prove configuration persists across runtime reopen, does not store environment values and rejects unknown connector ids.
- [ ] Add idempotent SQLite table/migrations using current repository patterns.
- [ ] Add configuration-to-existing-endpoint materialization helpers rather than duplicate model/adapter/browser/desktop registries.
- [ ] Verify persistence/recovery tests and commit.

---

### Task 3: Connector CLI

**Files:**
- Create: `packages/runtime/src/connectors/cli.ts`
- Create: `tests/runtime-connectors-cli.test.mjs`
- Modify: `packages/runtime/src/cli.ts`

**Interfaces:**
- Commands: `connectors list`, `show`, `add`, `configure`, `test`, `enable`, `disable`.
- All commands emit JSON to stdout; human summaries may be added behind an explicit format flag later.

- [ ] RED tests invoke CLI process and assert deterministic JSON, exit codes and error codes.
- [ ] Implement `list/show` from catalogue and `add/configure` through configuration store.
- [ ] `enable/disable` updates only connector state, not secrets or unrelated endpoints.
- [ ] `test` delegates to category-specific preflight adapters defined in Task 4.
- [ ] Verify CLI and commit.

---

### Task 4: Connector preflight engine

**Files:**
- Create: `packages/runtime/src/connectors/preflight.ts`
- Create: `packages/runtime/src/connectors/preflight-model.ts`
- Create: `packages/runtime/src/connectors/preflight-adapter.ts`
- Create: `packages/runtime/src/connectors/preflight-browser.ts`
- Create: `packages/runtime/src/connectors/preflight-desktop.ts`
- Create: `tests/runtime-connectors-preflight.test.mjs`

**Interfaces:**
```ts
export type DiagnosticState = 'ok'|'warning'|'blocked'|'unsupported'|'not-configured';
export interface DiagnosticCheck {
  id: string;
  state: DiagnosticState;
  message: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
}
export interface ConnectorPreflightReport {
  connectorId: string;
  state: DiagnosticState;
  checks: readonly DiagnosticCheck[];
}
```

- [ ] RED tests cover missing executable, missing env key, unreachable endpoint, unsupported OS and healthy deterministic fixture.
- [ ] Implement command discovery with `PATH` search that never executes through a shell.
- [ ] Implement environment presence check that returns boolean/key name only, never the value.
- [ ] Reuse model invocation, MCP/A2A discovery, browser endpoint validation and desktop bridge doctor interfaces for live tests.
- [ ] Verify and commit.

---

### Task 5: `q1x doctor`

**Files:**
- Create: `packages/runtime/src/doctor.ts`
- Create: `tests/runtime-doctor.test.mjs`
- Modify: `packages/runtime/src/cli.ts`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**
- `runDoctor(runtime, options): Promise<DoctorReport>`.
- CLI `q1x doctor --json`.

- [ ] RED tests require runtime readiness, OS, desktop bridge, browser, configured connectors, environment references and compatibility matrix statuses in one report.
- [ ] Implement aggregate state precedence: `blocked` > `unsupported` > `warning` > `not-configured` > `ok`, while preserving every individual check.
- [ ] Ensure doctor never writes configuration and never prints secret values.
- [ ] Add exact remediation strings for each first-party prerequisite.
- [ ] Verify and commit.

---

### Task 6: Compatibility lookup integration

**Files:**
- Create: `packages/runtime/src/connectors/compatibility.ts`
- Modify: `connectors/catalogue.json`
- Modify: `compatibility/matrix.json`
- Create: `tests/runtime-connectors-compatibility.test.mjs`

**Interfaces:**
- `getConnectorCompatibility(connectorId)` returns matrix status/evidence without manufacturing claims.

- [ ] RED tests prove catalogue ids must map either to a real matrix entry or explicitly state `experimental`/`unsupported` with no false evidence.
- [ ] Implement lookup against bundled/generated matrix data.
- [ ] Keep current experimental statuses until later end-to-end evidence exists.
- [ ] Verify matrix generator and commit.
