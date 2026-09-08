# Phase 11 Compatibility Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed, evidence-driven compatibility matrix with deterministic generated documentation and CI drift protection.

**Architecture:** `compatibility/matrix.json` is the source of truth. `scripts/compatibility/matrix-lib.mjs` validates and normalizes it, while `scripts/compatibility/generate-matrix.mjs` renders `docs/compatibility-matrix.md`. Repository tests enforce evidence, status semantics, deterministic ordering and checked-in documentation consistency.

**Tech Stack:** Node.js 24 ESM, `node:test`, JSON, Markdown, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-compatibility-matrix-community-adapter-sdk-design.md`

## Global Constraints

- Matrix version is exactly `1.0.0`.
- Status values are exactly `tested`, `experimental`, `unsupported`.
- `tested` requires concrete evidence with a 40-character lowercase commit SHA.
- `experimental` requires a caveat in `constraints` or `notes`.
- Unknown compatibility is never inferred.
- Generated Markdown must be deterministic.
- Public/community boundary and PolyForm Noncommercial License 1.0.0 remain unchanged.

---

### Task 1: Matrix validation library and RED tests

**Files:**
- Create: `tests/compatibility-matrix.test.mjs`
- Create: `scripts/compatibility/matrix-lib.mjs`

**Interfaces:**
- Produces: `validateCompatibilityMatrix(value)`, `normalizeCompatibilityMatrix(value)`, `renderCompatibilityMarkdown(matrix)`.

- [ ] **Step 1: Write failing validation tests**

Tests must cover: valid minimal matrix; duplicate IDs; duplicate compatibility tuple; invalid status/category; tested-without-evidence; malformed SHA; experimental-without-caveat; unsupported-with-success evidence; deterministic sorting.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test tests/compatibility-matrix.test.mjs`

Expected: FAIL because `scripts/compatibility/matrix-lib.mjs` does not exist.

- [ ] **Step 3: Implement minimal matrix library**

Export:

```js
export const MATRIX_VERSION = '1.0.0';
export const COMPATIBILITY_STATUSES = Object.freeze(['tested', 'experimental', 'unsupported']);
export const COMPATIBILITY_CATEGORIES = Object.freeze(['os', 'deployment', 'package-consumer', 'model-transport', 'adapter', 'browser', 'desktop', 'protocol']);
export function validateCompatibilityMatrix(value) { /* throws TypeError/Error on invalid input */ }
export function normalizeCompatibilityMatrix(value) { /* validated deep copy with deterministic entries */ }
export function renderCompatibilityMarkdown(matrix) { /* deterministic Markdown */ }
```

Use exact 40-lowercase-hex SHA validation. A CI evidence source must begin `.github/workflows/` or `tests/`.

- [ ] **Step 4: Run test and confirm GREEN**

Run: `node --test tests/compatibility-matrix.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add compatibility matrix validation`.

---

### Task 2: Initial evidence matrix and deterministic generator

**Files:**
- Create: `compatibility/matrix.json`
- Create: `scripts/compatibility/generate-matrix.mjs`
- Create: `docs/compatibility-matrix.md`
- Modify: `tests/compatibility-matrix.test.mjs`

**Interfaces:**
- Consumes: matrix library from Task 1.
- Produces: CLI generation command with `--check` mode.

- [ ] **Step 1: Add failing generator/drift tests**

Tests must assert:

```js
const generated = renderCompatibilityMarkdown(normalizeCompatibilityMatrix(source));
assert.equal(generated, checkedInMarkdown);
```

Also spawn `node scripts/compatibility/generate-matrix.mjs --check` and expect exit 0 only when checked-in docs match.

- [ ] **Step 2: Run RED**

Expected: missing source/generator/doc files.

- [ ] **Step 3: Add conservative initial matrix**

Seed tested entries only from evidence at Phase 10 merged SHA `371b27e265a5922184d0a48f57b966b9fbae959b`, including:

- Ubuntu 24.04 source install — `.github/workflows/cross-platform-packaging.yml`;
- macOS latest source install — same workflow;
- Windows latest source install — same workflow;
- Docker Linux non-root deployment — same workflow;
- packed external consumer — `.github/workflows/public-alpha.yml` and `tests/release-commissioning.test.mjs`.

Add adapter/browser/desktop entries as tested only when their repository tests directly support the claim; otherwise mark experimental with explicit constraints.

- [ ] **Step 4: Implement generator**

`generate-matrix.mjs` reads `compatibility/matrix.json`, validates/normalizes it, renders Markdown, and either writes `docs/compatibility-matrix.md` or compares it in `--check` mode.

- [ ] **Step 5: Generate docs and run tests GREEN**

Run:

```bash
node scripts/compatibility/generate-matrix.mjs
node --test tests/compatibility-matrix.test.mjs
node scripts/compatibility/generate-matrix.mjs --check
```

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add evidence-driven compatibility matrix`.

---

### Task 3: CI enforcement

**Files:**
- Create: `.github/workflows/compatibility.yml`
- Modify: `package.json`
- Modify: `tests/packaging.test.mjs`

**Interfaces:**
- Produces: focused `Compatibility Matrix` workflow.

- [ ] **Step 1: Add failing workflow-policy test**

Require `.github/workflows/compatibility.yml` to:

- run on pull requests affecting compatibility/scripts/tests/packages/workflow;
- run on push to `main`;
- use pinned checkout/setup-node SHAs already used by the repository;
- run `npm ci --no-audit --no-fund`;
- run compatibility tests;
- run generator `--check`;
- use read-only contents permission.

- [ ] **Step 2: Run RED**

Run: `node --test tests/packaging.test.mjs tests/compatibility-matrix.test.mjs`.

Expected: workflow missing.

- [ ] **Step 3: Implement focused workflow and root test script**

Add `test:compatibility` to root scripts:

```json
"test:compatibility": "node --test tests/compatibility-matrix.test.mjs && node scripts/compatibility/generate-matrix.mjs --check"
```

Workflow runs `npm run test:compatibility` after install.

- [ ] **Step 4: Run GREEN**

Run package tests locally/CI equivalent.

- [ ] **Step 5: Commit**

Commit message: `ci: enforce compatibility evidence matrix`.

---

### Task 4: Documentation integration

**Files:**
- Modify: `README.md`
- Modify: `docs/index.md`
- Modify: `docs/public-alpha.md`
- Modify: `docs/known-limitations.md`

**Interfaces:**
- Produces: discoverable matrix and conservative public wording.

- [ ] **Step 1: Add documentation acceptance assertions**

Extend packaging/docs tests to require links to `docs/compatibility-matrix.md` and explicit wording that absence from the matrix is not a compatibility claim.

- [ ] **Step 2: Run RED**

Expected: docs not yet integrated.

- [ ] **Step 3: Update docs**

Link the generated matrix from root/docs index and public-alpha pages. Preserve alpha/non-GA caveats. Do not claim universal provider/browser/desktop support.

- [ ] **Step 4: Run GREEN**

Run `npm test` and `npm run test:compatibility`.

- [ ] **Step 5: Commit**

Commit message: `docs: publish Phase 11 compatibility matrix`.
