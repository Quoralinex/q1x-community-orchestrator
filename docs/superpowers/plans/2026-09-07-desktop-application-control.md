# Phase 6B Desktop/Application Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver OS-neutral, allowlisted desktop/application control with pluggable macOS, Windows and Linux backends through the public Open Control Runtime.

**Architecture:** Add normative desktop endpoint/action contracts, then a backend/session abstraction that mirrors the proven browser lifecycle while remaining OS-neutral. Platform backends translate the same actions into direct native process/API calls; runtime and CLI expose one common surface and persist only configuration/capability/audit metadata.

**Tech Stack:** TypeScript 7, Node.js 24+, JSON Schema 2020-12, built-in child-process/filesystem APIs, macOS `open`/`osascript`/`screencapture`, Windows PowerShell/User32, Linux `xdotool`, existing SQLite Open Control Runtime.

**Spec:** `docs/superpowers/specs/2026-09-07-desktop-application-control-design.md`

## Global Constraints

- Public repository licence remains PolyForm Noncommercial License 1.0.0 and package licence propagation remains mandatory.
- Core contracts and runtime remain provider-, vendor- and OS-neutral.
- No shell interpolation or `shell: true` in desktop backends.
- Applications must be explicitly allowlisted per endpoint.
- Desktop sessions are memory-only; typed text, screenshots and UI content are not copied into runtime audit events.
- macOS permissions remain user-controlled; Windows/Linux unsupported environment states must be reported honestly.
- Existing protected-branch, CodeQL, test and distribution gates remain mandatory.

---

### Task 1: Normative desktop contracts and SDK types

**Files:**
- Create: `packages/contracts/schemas/v1/desktop-endpoint.schema.json`
- Create: `packages/contracts/schemas/v1/desktop-action-batch.schema.json`
- Create: `packages/sdk-typescript/src/desktop.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/sdk-typescript/src/index.ts`
- Modify: `packages/runtime/src/schema-loader.ts`
- Modify: `tests/schema-contracts.test.mjs`
- Modify: `tests/sdk-types.test.ts`

**Interfaces:**
- Produces `DesktopEndpoint`, `DesktopApplication`, `DesktopActionBatch`, `DesktopBatchResult` and schema IDs.

- [ ] Write failing schema/type/catalog tests for desktop endpoint/action contracts.
- [ ] Run targeted schema/type tests and confirm missing-contract failures.
- [ ] Implement strict schemas and matching TypeScript types.
- [ ] Re-run tests unchanged and confirm GREEN.
- [ ] Commit `feat: add desktop control contracts`.

### Task 2: Endpoint security and persistent registry

**Files:**
- Create: `packages/runtime/src/desktop-security.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/index.ts`
- Create: `tests/runtime-desktop-endpoint.test.mjs`

**Interfaces:**
- Produces `assertSafeDesktopEndpoint(endpoint)` and runtime `put/get/listDesktopEndpoint` methods.

- [ ] Write failing persistence/security tests covering application allowlists, absolute executable paths and screenshot-root validation.
- [ ] Run targeted tests and confirm missing API/security failures.
- [ ] Implement endpoint validation and SQLite persistence using the existing document store.
- [ ] Re-run targeted tests and confirm GREEN.
- [ ] Commit `feat: add secure desktop endpoint registry`.

### Task 3: Backend/session abstraction

**Files:**
- Create: `packages/runtime/src/desktop-backend.ts`
- Create: `tests/runtime-desktop-session.test.mjs`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**
- Produces `DesktopBackend`, `DesktopBackendProbe`, `DesktopSession`, `DesktopSessionManager`, `DesktopBackendRegistry`.

- [ ] Write failing tests with a deterministic in-memory backend for registration, session isolation, execution and close semantics.
- [ ] Run the test and confirm the backend/session API is absent.
- [ ] Implement the minimal backend registry/session manager with duplicate-backend protection and normalized missing-backend errors.
- [ ] Re-run unchanged tests and confirm GREEN.
- [ ] Commit `feat: add desktop backend session abstraction`.

### Task 4: macOS native backend

**Files:**
- Create: `packages/runtime/src/desktop-process.ts`
- Create: `packages/runtime/src/macos-desktop.ts`
- Create: `tests/runtime-desktop-macos.test.mjs`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**
- Produces `createMacosDesktopBackend()` and a direct process runner shared by native backends.

- [ ] Write failing tests for backend probe, allowlisted app command selection, lifecycle actions, screenshot bounds and unavailable optional mouse dependency behavior.
- [ ] Run targeted tests and confirm missing implementation.
- [ ] Implement direct `/usr/bin/open`, `/usr/bin/osascript`, `/usr/sbin/screencapture` execution and optional `cliclick` detection; never enable shell execution.
- [ ] Add a non-destructive real-host smoke test for probe/application inspection when running on macOS.
- [ ] Re-run tests and confirm GREEN without requiring the test suite to move the user's mouse.
- [ ] Commit `feat: add macos desktop backend`.

### Task 5: Windows native backend

**Files:**
- Create: `packages/runtime/src/windows-desktop.ts`
- Create: `tests/runtime-desktop-windows.test.mjs`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**
- Produces `createWindowsDesktopBackend()` using direct PowerShell process execution and fixed internal scripts.

- [ ] Write failing tests for selector validation, generated fixed-script arguments, launch/activate/input/capture mapping and unavailable-host probing.
- [ ] Run targeted tests and confirm RED.
- [ ] Implement PowerShell/User32 mapping without accepting executable script text from requests.
- [ ] Re-run tests and confirm GREEN on the non-Windows host through deterministic command compilation; platform availability must remain offline on macOS.
- [ ] Commit `feat: add windows desktop backend`.

### Task 6: Linux X11 backend

**Files:**
- Create: `packages/runtime/src/linux-desktop.ts`
- Create: `tests/runtime-desktop-linux.test.mjs`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**
- Produces `createLinuxX11DesktopBackend()` with `xdotool` and screenshot-tool probing.

- [ ] Write failing tests for X11 availability, Wayland-only rejection, direct argv mapping and screenshot dependency behavior.
- [ ] Run targeted tests and confirm RED.
- [ ] Implement direct `xdotool`/screenshot-tool command mapping and explicit unsupported states.
- [ ] Re-run tests and confirm GREEN on macOS through deterministic compilation while the live probe remains unavailable.
- [ ] Commit `feat: add linux x11 desktop backend`.

### Task 7: Runtime lifecycle, audit and capability discovery

**Files:**
- Modify: `packages/runtime/src/runtime.ts`
- Create: `tests/runtime-desktop-runtime.test.mjs`

**Interfaces:**
- Produces `registerDesktopBackend`, `open/execute/closeDesktopSession`, `runDesktopBatch`, `discoverDesktopCapability`.

- [ ] Write failing runtime tests for session lifecycle, cancellation, metadata-only auditing and capability persistence.
- [ ] Run targeted tests and confirm RED.
- [ ] Register platform backends in the default registry and implement runtime lifecycle methods.
- [ ] Ensure audit payloads contain endpoint/backend/action count/status/duration/error code only.
- [ ] Re-run tests and confirm GREEN.
- [ ] Commit `feat: integrate desktop control runtime`.

### Task 8: CLI, examples and documentation

**Files:**
- Modify: `packages/runtime/src/cli.ts`
- Create: `examples/desktop-endpoints/*.json`
- Create: `docs/desktop-control.md`
- Modify: `README.md`
- Modify: `docs/index.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/contracts.md`
- Modify: `packages/runtime/README.md`
- Modify: `tests/examples.test.mjs`
- Create: `tests/runtime-desktop-cli.test.mjs`

**Interfaces:**
- Produces `desktop-endpoints put/list/get`, `desktop discover`, `desktop run` one-shot CLI commands.

- [ ] Write failing CLI/example tests.
- [ ] Implement CLI commands over the same runtime API and add provider-neutral schema-valid examples.
- [ ] Add public documentation for platform support, permissions, dependencies and security boundaries.
- [ ] Re-run CLI/example tests and confirm GREEN.
- [ ] Commit `feat: expose desktop control cli and docs`.

### Task 9: Clean-room release gate and protected merge

**Files:**
- Modify only if verification finds a repository-owned defect.

**Interfaces:**
- Produces the protected Phase 6B merge and verified merged `main`.

- [ ] Delete generated output/dependencies and run `npm ci`.
- [ ] Run `npm run check` and all desktop tests.
- [ ] Run `npm audit --audit-level=high`.
- [ ] Dry-pack all three public workspaces and verify PolyForm Noncommercial License 1.0.0 propagation.
- [ ] Run public/private leakage scan, full-SHA Action check and `git diff --check`.
- [ ] Push `feat/phase6b-desktop-application-control`, open a protected PR and wait for required checks/CodeQL.
- [ ] Squash-merge, verify merged `main`, post-merge CI/CodeQL/Pages and remove the Phase 6B worktree.
- [ ] Continue directly into Phase 7 unless a genuine user-only blocker appears.
