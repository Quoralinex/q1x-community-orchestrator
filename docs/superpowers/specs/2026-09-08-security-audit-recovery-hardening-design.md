# Phase 9 Security, Approvals, Evidence, Audit and Recovery Hardening Design

## Purpose

Harden the public Q1X Community Orchestrator runtime so consequential actions remain fail-closed, governance decisions and evidence are durable, audit metadata is tamper-evident without copying sensitive execution content, and interrupted work can be reconciled safely after restart.

## Scope

Phase 9 extends the existing public contracts and single-node runtime. It does not introduce private Q1X control-plane authority, proprietary commercial policy logic, hosted identity infrastructure, or a second orchestration architecture.

## Security model

1. Protected work items remain non-runnable while `approvalRequired` is true.
2. Approval requests are durable and initially `pending`.
3. Decisions enforce the declared approver-kind boundary.
4. Only an `approved` decision may be applied to its exact protected subject.
5. Applying approval creates a checkpoint first, clears the protected flag, and consumes the approval so it cannot be replayed.
6. Rejected, missing, mismatched or already-consumed approvals fail closed with `AUTHORIZATION_REQUIRED`.

## Evidence model

Evidence remains a provider-neutral immutable envelope. Phase 9 adds bounded provenance references for the execution and result that produced the evidence plus an optional SHA-256/SHA-512 content digest. Evidence identifiers are single-write; later mutation under the same identifier is rejected.

## Audit model

Security-relevant governance actions produce a separate metadata-only audit receipt chain. Each receipt contains a monotonic sequence, event type, subject reference, optional scope, redacted metadata, previous digest and SHA-256 digest. Secret-shaped keys such as authorization, cookies, credentials, passwords, sessions, API keys and tokens are recursively redacted before persistence.

Verification recomputes every receipt from sequence 1 and fails at the first digest or previous-link mismatch. Service startup verifies the chain before becoming ready. Audit failure is fail-closed.

The audit layer must not copy prompts, model messages, browser page/session content, desktop UI text, typed values, cookies, credentials or binary artifacts into routine receipts.

## Recovery model

A restart may find durable assignments whose last state is `running`. Those assignments cannot be assumed to have completed or failed. Reconciliation groups them by programme, creates a checkpoint, marks assignments `interrupted`, moves matching running work nodes to `blocked`, writes a recovery audit receipt and leaves normal supervision retry/replan policy to decide the next action.

If reconciliation fails after the checkpoint is created, the checkpoint is restored before the error escapes.

## CLI and operator surface

The JSON-first CLI exposes approval request/list/show/decision/application, evidence record/list/show, audit list/verify and explicit recovery reconciliation. Input documents continue to be supplied through `--file` rather than inline secret-bearing arguments.

## Verification

Phase 9 acceptance requires deterministic tests for unauthorized approval, approval replay, immutable evidence, redaction, deliberate SQLite audit tampering, interrupted-assignment recovery and CLI round trips. Existing runtime, schema, SDK, distribution/licence, cross-platform packaging and CodeQL gates must remain green.

## Public/private boundary

Only generic provider-neutral governance and recovery mechanisms belong in this repository. No private Q1X control-plane code, enterprise policy corpus, proprietary company-governance implementation or confidential architecture may be introduced.
