# Phase 12 Cross-Platform Product Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the completed ecosystem works as a standalone product on Windows, macOS and Linux without users writing missing Q1X code or connecting to a private/proprietary Quoralinex service, and make compatibility/public claims track that evidence.

**Architecture:** Add one cross-platform product-usability workflow that installs the repository from scratch, builds all first-party packages, starts deterministic local fixtures, configures connectors through public CLI commands, runs doctor, executes representative model/MCP/browser/desktop flows and uploads structured evidence. Compatibility matrix promotion consumes only exact committed CI evidence. A separate standalone-boundary audit verifies active product surfaces contain no private-service dependency or integration path.

**Tech Stack:** GitHub Actions, Node.js 24, current cross-platform packaging workflows, deterministic local fixtures, Xvfb/AT-SPI test environment on Linux, platform-specific desktop bridge harnesses.

**Spec:** `docs/superpowers/specs/2026-09-09-core-usability-ecosystem-design.md`

## Global Constraints

- No test may edit product source/config internals as part of normal user setup.
- Tests configure via released/public CLI/API surfaces only.
- No paid API or external SaaS is required for the acceptance suite.
- Hosted-runner limitations are documented instead of converted into false success claims.
- `v0.1.0-alpha.1` remains immutable.
- No private/proprietary Quoralinex service, package, endpoint, environment key, authority callback or continuity callback may be required by active product surfaces.
- Phase 12 is not complete until all mandatory product-usability jobs and the standalone-boundary audit are green on the exact feature head and after merge on protected `main`.

---

### Task 1: Product-usability fixture runner

**Files:**
- Create: `tests/fixtures/product-usability/model-server.mjs`
- Create: `tests/fixtures/product-usability/mcp-server.mjs`
- Create: `tests/fixtures/product-usability/a2a-server.mjs`
- Create: `tests/fixtures/product-usability/cli-tool.mjs`
- Create: `tests/fixtures/product-usability/web-server.mjs`
- Create: `tests/product-usability.test.mjs`

**Interfaces:**
- Fixtures bind loopback ephemeral ports only and expose machine-readable startup metadata.
- Product test invokes the built CLI as a child process and never imports private runtime internals for setup.

- [ ] Write RED test requiring catalogue listing, connector configuration, doctor, model invocation, MCP discovery/call, A2A discovery/send and CLI tool execution.
- [ ] Add RED assertion that the entire fixture flow works with no private-service configuration or credential present.
- [ ] Implement deterministic fixtures.
- [ ] Add browser portion when a supported browser is supplied.
- [ ] Add desktop portion through the platform bridge package/harness.
- [ ] Verify locally in Linux CI and commit.

---

### Task 2: Cross-platform product-usability workflow

**Files:**
- Create: `.github/workflows/product-usability.yml`
- Modify: `tests/packaging.test.mjs`

**Interfaces:**
- Jobs: `product-ubuntu-24-04`, `product-macos-latest`, `product-windows-latest`.
- All third-party Actions remain pinned to full commit SHAs.

- [ ] RED packaging test requires the workflow, read-only permissions, Node 24, clean `npm ci`, build and product-usability command on all three OS families.
- [ ] Add Linux virtual display/accessibility setup for AT-SPI bridge execution.
- [ ] Add Windows deterministic UI Automation target/harness.
- [ ] Add macOS doctor plus authorized deterministic accessibility harness; retain a separate physical-host evidence state if runner privacy restrictions prevent real UI control.
- [ ] Upload `phase12-product-evidence-<os>.json` artifacts.
- [ ] Verify jobs green and commit.

---

### Task 3: Standalone dependency audit

**Files:**
- Create: `scripts/phase12/verify-standalone.mjs`
- Create: `tests/phase12-standalone.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `npm run verify:standalone` scans active product surfaces only.
- Historical design records under earlier dated spec/plan paths are excluded from dependency conclusions but remain auditable historical text.

- [ ] RED test requires the verifier and proves it rejects a synthetic private-service package dependency, endpoint URL, reserved private-service environment key, authority/continuity callback or built-in connector profile.
- [ ] Implement deterministic scanning of active package manifests, runtime source, connectors, workflows, release scripts, current product docs and examples.
- [ ] Verify the current Phase 12 tree passes without allow-listing active product exceptions.
- [ ] Add `verify:standalone` to repository checks and commit.

---

### Task 4: Compatibility matrix promotion

**Files:**
- Modify: `compatibility/matrix.json`
- Regenerate: `docs/compatibility-matrix.md`
- Modify: `tests/compatibility-matrix.test.mjs`

**Interfaces:**
- Tested entries reference exact 40-hex commit SHA and `.github/workflows/product-usability.yml`/focused tests.

- [ ] Add RED tests requiring named entries for three desktop bridges, model fixtures, MCP stdio/HTTP, A2A, CLI JSON/text, browser runner configuration and connector doctor/catalogue.
- [ ] Promote only surfaces actually exercised by green jobs.
- [ ] Keep any physical-host-specific macOS/desktop caveat experimental if CI cannot prove it.
- [ ] Regenerate docs and verify drift check.
- [ ] Commit.

---

### Task 5: Release package-set governance

**Files:**
- Modify: `scripts/release/release-metadata.mjs`
- Modify: `scripts/release/prepare-alpha.mjs`
- Modify: `scripts/release/verify-packed-consumer.mjs`
- Modify: `.github/workflows/public-alpha.yml`
- Modify: `tests/release-commissioning.test.mjs`
- Modify: `tests/release-adapter-governance.test.mjs`
- Create: `tests/release-phase12-governance.test.mjs`

**Interfaces:**
- Governed release package set includes every first-party package a normal baseline install needs.
- Packed-consumer verification installs the exact tarballs locally and runs connector listing/doctor plus bridge `--doctor` smoke tests.

- [ ] RED tests reject omission of required first-party bridge/common packages and wrong dependency order.
- [ ] RED tests reject private/proprietary package dependencies, private service endpoints and private service credential requirements in release metadata/artifacts.
- [ ] Extend metadata/checksum generation deterministically.
- [ ] Preserve trusted npm publishing as optional only; do not add token fallback.
- [ ] Verify packed external consumer and checksums.
- [ ] Commit.

---

### Task 6: Public claim audit

**Files:**
- Modify: `README.md`
- Modify: `docs/index.md`
- Modify: `docs/desktop-control.md`
- Modify: `docs/browser-control.md`
- Modify: `docs/model-transport.md`
- Modify: `docs/agent-cli-adapters.md`
- Modify: `docs/known-limitations.md`
- Modify: `docs/deployment.md`
- Modify: `docs/roadmap.md`
- Create: `docs/product-usability.md`
- Create: `tests/phase12-claims.test.mjs`

**Interfaces:**
- `docs/product-usability.md` maps each advertised baseline capability to its install/configure/test command and evidence status.

- [ ] RED tests detect stale statements that native bridges are not bundled after they are shipped, or statements claiming untested provider/application combinations.
- [ ] RED tests require current product docs to describe standalone operation and forbid instructions to configure a private/proprietary Quoralinex service.
- [ ] Rewrite public status around real product capability rather than extension architecture.
- [ ] Document exact legitimate prerequisites: API key/model service, OS permission, browser installation, external public service credentials.
- [ ] State explicitly that ordinary baseline use requires no Q1X code development and no private Quoralinex service.
- [ ] Verify Pages build and docs tests.
- [ ] Commit.

---

### Task 7: Phase 12 completion gate

**Files:**
- Create: `scripts/phase12/verify-completion.mjs`
- Create: `tests/phase12-completion.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/repository-baseline.yml`

**Interfaces:**
- `npm run verify:phase12` is a deterministic local repository gate.

- [ ] RED completion test requires all first-party package manifests/bins, connector catalogue/profile inventory, doctor command, product-usability workflow, compatibility entries, public usability document and successful standalone verifier structure.
- [ ] Implement verifier as structural/evidence validation; it must not fabricate CI success.
- [ ] Wire both `verify:standalone` and `verify:phase12` into repository baseline.
- [ ] Verify the exact branch head across Repository Baseline, Runtime & Contracts, CodeQL, Cross-platform Packaging, Compatibility Matrix, Product Usability and Public Alpha validation.
- [ ] Mark PR ready only after every mandatory job is green.
- [ ] Squash merge with expected-head guard.
- [ ] Re-run the same mandatory gates on exact merged `main` and verify Pages.

Phase 12 is then complete. Do not begin hardening until this gate is green.
