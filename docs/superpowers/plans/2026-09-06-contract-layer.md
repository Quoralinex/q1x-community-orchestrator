# Phase 1 Contract Layer Implementation Plan

**Date:** 2026-09-06
**Goal:** Deliver versioned provider-neutral orchestration contracts plus a TypeScript reference SDK and cross-domain examples.

**Architecture:** JSON Schema 2020-12 is normative. An npm workspace packages the schemas and a separate TypeScript SDK provides convenience interfaces and a minimal capability-adapter abstraction. Tests validate every schema and example before implementation is accepted.

**Tech stack:** Node.js 20+, npm workspaces, TypeScript, AJV 2020, Node test runner, GitHub Actions.

## Task 1 — Establish test harness and workspace

- Add root `package.json`, `tsconfig.json`, package manifests and strict TypeScript configs.
- Add schema test harness under `tests/` before schemas exist.
- Run `npm test` and capture the expected RED failure for missing Phase 1 contracts.
- Commit test/scaffold baseline.

## Task 2 — Implement normative v1 schemas

- Add `packages/contracts/schemas/v1/*.schema.json` for common, mission, programme, work graph, replanning, capability, adapter manifest, execution, evidence, artifact, approval, checkpoint and deployment profile.
- Add `packages/contracts/src/index.ts` for contract IDs/version/adapter-kind constants.
- Run schema tests until schema meta-validation passes.
- Commit normative contracts.

## Task 3 — Add cross-domain examples test-first

- Add tests that require company-launch, digital-R&D and software-delivery example documents and validate them against named schemas.
- Confirm tests fail before fixtures exist.
- Add the minimum valid examples for all contract families.
- Add deliberate invalid fixtures/tests for missing mission outcomes, unsupported adapter kinds and incomplete approval decisions.
- Commit examples and validation coverage.

## Task 4 — Build the TypeScript reference SDK test-first

- Add compile-time/runtime smoke tests for exported SDK shapes.
- Implement reference types and `CapabilityAdapter` in `packages/sdk-typescript/src/`.
- Keep discovery and execution as the only required adapter methods in Phase 1.
- Build both workspaces under strict TypeScript settings.
- Commit SDK.

## Task 5 — CI, docs and package readiness

- Add a GitHub Actions Phase 1 workflow using only SHA-pinned GitHub-owned actions.
- Add Dependabot npm configuration if absent.
- Update architecture/README/roadmap to document the contract layer without prescribing external CI or private Q1X tooling.
- Run full local verification: clean install, tests, build, contract validation, `git diff --check`.
- Push branch, open PR, wait for real repository checks, inspect diff, then squash merge only if all required checks pass.
