# Phase 9 Security, Approvals, Evidence, Audit and Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and verify fail-closed approvals, immutable evidence, tamper-evident redacted audit receipts and checkpoint-backed interrupted-work recovery for the Q1X Community Orchestrator.

**Architecture:** Extend the existing SQLite-backed Open Control Runtime through the current `security-extension` and `security-audit` modules. Governance records remain provider-neutral documents; security audit receipts remain metadata-only and hash-linked; recovery reuses the existing checkpoint and work-graph lifecycle instead of adding a second state system.

**Tech Stack:** Node.js 24+, TypeScript, built-in `node:sqlite`, built-in `node:crypto`, JSON Schema 2020-12, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-security-audit-recovery-hardening-design.md`

## Global Constraints

- Preserve provider neutrality and OS neutrality.
- Keep PolyForm Noncommercial License 1.0.0 as the public repository/package licensing baseline.
- Do not persist prompts, browser/desktop session content, typed secrets, credentials, cookies or tokens in security audit receipts.
- Consequential actions fail closed without matching approval.
- Recovery must checkpoint before mutating abandoned running state.
- Existing Runtime and Contracts, CodeQL and Cross-platform Packaging gates must remain green.

---

### Task 1: Complete security contract and runtime integration

**Files:**
- Modify: `packages/contracts/schemas/v1/approval.schema.json`
- Modify: `packages/contracts/schemas/v1/evidence.schema.json`
- Create/verify: `packages/contracts/schemas/v1/audit-receipt.schema.json`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/sdk-typescript/src/governance.ts`
- Modify: `packages/runtime/src/schema-loader.ts`
- Modify: `packages/runtime/src/security-audit.ts`
- Modify: `packages/runtime/src/security-extension.ts`
- Modify: `packages/runtime/src/errors.ts`
- Test: `tests/runtime-security-hardening.test.mjs`

**Interfaces:**
- Produces: `requestApproval`, `decideApproval`, `applyApproval`, `recordEvidence`, `appendAuditReceipt`, `verifyAuditChain`, `reconcileInterruptedAssignments` on `OpenControlRuntime`.
- Produces: `AuditReceipt` and `AuditVerification` SDK types.

- [ ] **Step 1: Run the existing Phase 9 hardening test to establish the red/green baseline**

Run: `npm run build && node --test tests/runtime-security-hardening.test.mjs`

Expected: any failure must identify an implementation defect in the new governance/audit/recovery behavior; if green, proceed to Task 2 without changing production behavior.

- [ ] **Step 2: Fix only failures exposed by the hardening test**

Implementation rule: preserve the design above; do not add unrelated policy or provider-specific behavior.

- [ ] **Step 3: Re-run the Phase 9 hardening test**

Run: `npm run build && node --test tests/runtime-security-hardening.test.mjs`

Expected: PASS.

### Task 2: Add CLI governance and recovery surfaces using TDD

**Files:**
- Modify: `packages/runtime/src/cli.ts`
- Create: `tests/runtime-security-cli.test.mjs`
- Create: `examples/security/example.approval-request.json`
- Create: `examples/security/example.approval-decision.json`
- Create: `examples/security/example.evidence.json`

**Interfaces:**
- Consumes: Phase 9 runtime methods from Task 1.
- Produces CLI commands:
  - `approval request --file <path>`
  - `approval list [--programme <id>]`
  - `approval show <id>`
  - `approval decide <id> --file <path>`
  - `approval apply <id>`
  - `evidence record --file <path> [--programme <id>]`
  - `evidence list [--programme <id>]`
  - `evidence show <id>`
  - `audit list`
  - `audit verify`
  - `recovery reconcile [--programme <id>]`

- [ ] **Step 1: Write CLI tests that fail because the commands are not yet exposed**

Test real spawned CLI behavior and JSON outputs; assert unauthorized approval application returns `AUTHORIZATION_REQUIRED`.

- [ ] **Step 2: Run the CLI test and verify the expected failure**

Run: `npm run build && node --test tests/runtime-security-cli.test.mjs`

Expected: FAIL with unknown security/governance command(s).

- [ ] **Step 3: Add minimal CLI imports and command routing**

Import the Phase 9 SDK governance types and `./security-extension.js`, then route the commands exactly as listed above using existing `--file` helpers.

- [ ] **Step 4: Re-run CLI tests**

Run: `npm run build && node --test tests/runtime-security-cli.test.mjs`

Expected: PASS.

### Task 3: Validate contracts, examples and distribution

**Files:**
- Modify: `tests/schema-contracts.test.mjs`
- Modify: `tests/examples.test.mjs`
- Modify: `tests/dist-contracts.test.mjs`
- Modify: `tests/sdk-types.test.ts`

**Interfaces:**
- Consumes: new audit receipt schema and governance SDK fields.
- Produces: regression evidence that public packages contain and type the Phase 9 contract surface.

- [ ] **Step 1: Add failing schema/example/distribution/type assertions for Phase 9**

Run: `npm test && npm run test:types && npm run test:dist`

Expected: FAIL before the test harness includes the new schema/examples/exports.

- [ ] **Step 2: Make the minimum registry/example/export changes required**

Do not broaden schemas beyond the documented Phase 9 contract fields.

- [ ] **Step 3: Re-run contract/type/distribution checks**

Run: `npm test && npm run test:types && npm run test:dist`

Expected: PASS.

### Task 4: Document operator security and recovery behavior

**Files:**
- Create: `docs/security-hardening.md`
- Modify: `docs/index.md`
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `SECURITY.md`

**Interfaces:**
- Produces: public documentation of approval semantics, audit-chain verification, evidence immutability, startup failure behavior, recovery reconciliation and private/public boundary.

- [ ] **Step 1: Document exact CLI commands and failure behavior**

Include the rule that audit-chain corruption prevents the local service from entering ready state.

- [ ] **Step 2: Document backup/recovery implications**

Explain that the SQLite database contains both runtime state and security audit receipts and must be backed up atomically.

- [ ] **Step 3: Mark Phase 9 implemented only after CI is green**

Until merge, wording must remain “Phase 9 in delivery” or equivalent.

### Task 5: Full verification and merge gate

**Files:**
- No production files unless verification identifies a defect.

- [ ] **Step 1: Run the complete repository check through CI**

Required gates: Repository Baseline, Runtime and Contracts, CodeQL, Cross-platform Packaging, plus any Phase 9-specific workflow/check added by the branch.

- [ ] **Step 2: Confirm no unresolved PR review threads and no public/private leakage**

Verify changed files remain limited to Community-safe contracts/runtime/tests/examples/docs/workflows.

- [ ] **Step 3: Move PR from draft to ready only when the exact final head is green**

- [ ] **Step 4: Squash merge and verify authoritative `main` points at the accepted Phase 9 commit**

- [ ] **Step 5: Begin Phase 10 only from the verified merged `main` SHA**
