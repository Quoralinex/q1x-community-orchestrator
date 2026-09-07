# Phase 6A Browser and Web Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver real, provider-neutral browser/web control with safe endpoint persistence, in-process sessions, one-shot CLI execution and a pluggable browser backend.

**Architecture:** Add language-neutral browser endpoint/action contracts, then a Playwright Core backend behind a Q1X `BrowserBackend` registry. Live browser state remains memory-only; the SQLite runtime persists endpoint configuration and metadata-only audit events. CLI execution is one-shot while SDK/runtime callers may hold long-lived sessions.

**Tech Stack:** Node.js 24+, TypeScript 7, JSON Schema 2020-12, Playwright Core 1.63.0, built-in SQLite, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-browser-web-control-design.md`

## Global Constraints

- `LICENSE` remains PolyForm Noncommercial License 1.0.0 and every published workspace package carries it.
- Browser runtime dependency is exactly `playwright-core@1.63.0`; browser binaries are not bundled in the runtime package.
- Browser implementation is provider-neutral and OS-neutral; no paid browser service is mandatory.
- Browser cookies, credentials, session storage and authentication tokens are never persisted by Q1X.
- Runtime browser audit events are metadata-only.
- Production changes follow RED → GREEN → refactor TDD and land through the protected pull-request gates.

---

### Task 1: Normative browser endpoint and action contracts

**Files:**
- Create: `packages/contracts/schemas/v1/browser-endpoint.schema.json`
- Create: `packages/contracts/schemas/v1/browser-action-batch.schema.json`
- Create: `packages/sdk-typescript/src/browser.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/sdk-typescript/src/index.ts`
- Modify: `packages/runtime/src/schema-loader.ts`
- Test: `tests/schema-contracts.test.mjs`, `tests/sdk-types.test.ts`, `tests/dist-contracts.test.mjs`

**Interfaces:**
- Produces: `BrowserEndpoint`, `BrowserActionBatch`, `BrowserAction`, `BrowserTarget`, `BrowserBatchResult`.

- [ ] Write RED schema/catalog/type tests proving both normative contracts and SDK types are missing.
- [ ] Run the focused schema/type/distribution tests and confirm the failures are caused by the missing Phase 6 contracts.
- [ ] Add strict endpoint/action schemas, schema ids and matching TypeScript reference types.
- [ ] Run the unchanged focused tests and make them GREEN.
- [ ] Commit `feat: add browser control contracts`.

### Task 2: Secure browser endpoint registry

**Files:**
- Create: `packages/runtime/src/browser-security.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Test: `tests/runtime-browser-endpoint.test.mjs`

**Interfaces:**
- Produces: `putBrowserEndpoint`, `getBrowserEndpoint`, `listBrowserEndpoints`, `assertSafeBrowserEndpoint`.

- [ ] Write RED persistence and security tests for managed/CDP endpoints, insecure remote CDP, embedded credentials, unsafe output paths and navigation schemes.
- [ ] Run the focused test and confirm RED because browser endpoint APIs do not exist.
- [ ] Implement validated SQLite endpoint persistence and security checks without session persistence.
- [ ] Run focused tests and make them GREEN.
- [ ] Commit `feat: add secure browser endpoint registry`.

### Task 3: Browser backend registry and Playwright session lifecycle

**Files:**
- Create: `packages/runtime/src/browser-backend.ts`
- Create: `packages/runtime/src/playwright-browser.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`, `package-lock.json`
- Test: `tests/runtime-browser-session.test.mjs`, `tests/helpers/browser-test-runtime.mjs`

**Interfaces:**
- Produces: `BrowserBackend`, `BrowserBackendRegistry`, `BrowserSessionManager.openSession/closeSession` and Playwright backend `playwright`.

- [ ] Write RED real-browser tests for ephemeral managed-session isolation and close semantics.
- [ ] Run focused tests against a real Chromium-compatible executable and verify RED because the backend/session manager is absent.
- [ ] Add exact `playwright-core@1.63.0`, implement the backend registry and minimal managed Chromium lifecycle.
- [ ] Run the unchanged tests and make them GREEN.
- [ ] Extend the implementation for declared managed engines and CDP connection without adding untested browser-specific claims.
- [ ] Commit `feat: add Playwright browser session lifecycle`.

### Task 4: Safe inspection, navigation and DOM interaction

**Files:**
- Modify: `packages/runtime/src/playwright-browser.ts`
- Create: `packages/runtime/src/browser-actions.ts`
- Test: `tests/runtime-browser-actions.test.mjs`, `tests/fixtures/browser-site/*`

**Interfaces:**
- Consumes: `BrowserActionBatch` and an open session.
- Produces: normalized ordered `BrowserBatchResult` action results.

- [ ] Write RED real-page tests for navigate, inspect, extract, click, double-click, hover, fill, type, press, select, check, uncheck, back, forward, reload and wait.
- [ ] Add a local HTTP fixture whose DOM exposes form and navigation state without external network dependencies.
- [ ] Implement only the actions required by the RED tests, locator resolution and password-value redaction.
- [ ] Run focused tests and make them GREEN.
- [ ] Commit `feat: add browser navigation and DOM actions`.

### Task 5: Mouse, files and captures

**Files:**
- Modify: `packages/runtime/src/browser-actions.ts`
- Test: `tests/runtime-browser-io.test.mjs`, `tests/fixtures/browser-site/*`

**Interfaces:**
- Adds: coordinate mouse actions, drag, wheel, upload, download and screenshot.

- [ ] Write RED real-browser tests for mouse move/down/up, wheel, drag, allowed upload, rejected out-of-root upload, download containment and screenshot output.
- [ ] Implement bounded file path resolution and the tested browser actions.
- [ ] Run focused tests and make them GREEN.
- [ ] Commit `feat: add browser mouse file and capture actions`.

### Task 6: Runtime lifecycle, capability discovery and metadata-only audit

**Files:**
- Modify: `packages/runtime/src/runtime.ts`
- Test: `tests/runtime-browser-runtime.test.mjs`

**Interfaces:**
- Produces: `openBrowserSession`, `executeBrowserSession`, `closeBrowserSession`, `runBrowserBatch`, `discoverBrowserCapability`.

- [ ] Write RED runtime tests proving sessions are memory-only, execution content is absent from audit storage, origin policies are enforced and cancellation/timeouts return normalized failures.
- [ ] Implement the runtime methods over `BrowserSessionManager`, including one-shot `runBrowserBatch` cleanup in `finally`.
- [ ] Persist discovered browser capability descriptors into the existing registry without persisting session data.
- [ ] Run focused and existing runtime tests and make them GREEN.
- [ ] Commit `feat: integrate browser control runtime`.

### Task 7: One-shot CLI and public examples

**Files:**
- Modify: `packages/runtime/src/cli.ts`
- Create: `examples/browser-endpoints/managed-chromium.endpoint.json`
- Create: `examples/browser-endpoints/existing-cdp.endpoint.json`
- Create: `examples/browser-endpoints/example.browser-batch.json`
- Modify: `tests/examples.test.mjs`
- Test: `tests/runtime-browser-cli.test.mjs`

**Interfaces:**
- Produces CLI: `browser-endpoints put/list/get`, `browser run <endpoint> --file <batch>`, `browser discover <endpoint>`.

- [ ] Write RED CLI round-trip and example-validation tests.
- [ ] Implement one-shot browser CLI commands; do not add fake cross-process open/close session commands.
- [ ] Add schema-valid local-first examples containing no credentials or cookies.
- [ ] Run the focused CLI/example tests and make them GREEN.
- [ ] Commit `feat: expose browser control CLI`.

### Task 8: Documentation, CI and protected merge

**Files:**
- Create: `docs/browser-control.md`
- Modify: `README.md`, `docs/index.md`, `docs/architecture.md`, `docs/roadmap.md`, `packages/runtime/README.md`
- Modify: `.github/workflows/contracts-ci.yml` only if the GitHub runner requires explicit browser verification setup.

**Interfaces:**
- Documents browser compatibility honestly: Playwright-managed engines when installed, CDP for Chromium-family existing sessions, native Safari as a future backend.

- [ ] Document browser/web-chat control, session reuse, security boundaries, OS neutrality, local browser requirements and extension backend contract.
- [ ] Verify any browser CI setup remains GitHub-native, SHA-pinned where an Action is used, and requires no paid browser service.
- [ ] Run clean `npm ci`, full `npm run check`, `npm audit --audit-level=high`, all package dry-runs, licence propagation check, private-boundary scan, Action SHA-pin check and `git diff --check`.
- [ ] Push the feature branch, open a protected PR, wait for repository-baseline/contracts-ci/CodeQL, squash merge and verify merged `main` plus Pages.
- [ ] Continue to Phase 6B desktop/application control unless a genuine user-only blocker appears.
