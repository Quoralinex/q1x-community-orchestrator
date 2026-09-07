# Phase 6B Desktop and Application Control Implementation Plan

**Goal:** Deliver OS-neutral desktop/application contracts, safe endpoint persistence, a neutral JSON stdio bridge backend, capability discovery and CLI execution.

**Spec:** `docs/superpowers/specs/2026-09-07-desktop-application-control-design.md`

## Global constraints

- Continue from merged Phase 6A on `main`; do not replace or duplicate the browser subsystem.
- PolyForm Noncommercial License 1.0.0 remains the public repository/package licence.
- No paid service, OS-specific native library or shell execution is mandatory.
- Desktop UI/application content is never copied into runtime audit events.
- Secret values are environment-resolved only.

### Task 1 — Normative desktop contracts and SDK types

Create `desktop-endpoint.schema.json`, `desktop-action-batch.schema.json` and matching TypeScript types. Add schema ids, loader entries, exports and distribution/type tests.

### Task 2 — Desktop security and endpoint registry

Add `assertSafeDesktopEndpoint` and batch policy checks. Persist validated desktop endpoints through `OpenControlRuntime`, enforce host-platform compatibility, application allow/block policy and output-path confinement.

### Task 3 — Backend registry and stdio bridge

Add `DesktopBackend`, `DesktopBackendRegistry` and built-in `stdio-bridge`. Spawn configured executables directly with explicit argv, minimal/allowlisted environment, bounded stdout/stderr, timeout and cancellation. Normalize bridge batch results and sanitized transport failures.

### Task 4 — Runtime execution, capability discovery and audit

Add `runDesktopBatch`, `registerDesktopBackend` and `discoverDesktopCapability`. Validate batches before execution and write metadata-only endpoint/execution/discovery events.

### Task 5 — CLI, portable fixture and integration tests

Add `desktop-endpoints put/list/get` plus `desktop run/discover`. Use a portable Node fixture to verify success, failure, timeout, output limits, environment isolation, application policy, output path policy and CLI round trips.

### Task 6 — Examples, docs and protected merge

Add validated endpoint/action examples, architecture/README/Pages updates and mark Phase 6B implemented. Run the protected repository gates, open PR, resolve failures, squash merge only when required checks/reviews pass and verify merged `main`.
