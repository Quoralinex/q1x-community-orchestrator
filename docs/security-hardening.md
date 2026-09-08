# Security, approvals, evidence, audit and recovery

Phase 9 hardened the single-node Community runtime around consequential-action approval, evidence provenance, tamper-evident audit metadata and restart recovery. These controls are provider-neutral and reuse the existing SQLite state, work graph and checkpoint model.

> **Delivery status:** Phase 9 is implemented on protected `main`. Phase 10 public-alpha commissioning does not widen these security claims; see [Public alpha known limitations](known-limitations.md) for the release boundary.

## Consequential-action approvals

A work node with `approvalRequired: true` remains fail-closed. The supervisor will not form an execution team for it until a matching approval has been requested, authorised, approved and applied.

Approval lifecycle:

1. `pending` approval request is persisted for an exact subject;
2. a decision actor must match one of `requiredApproverKinds` when that restriction is present;
3. rejected, missing or undecided approvals cannot be applied;
4. applying an approved decision creates a checkpoint before changing the work graph;
5. the exact protected work node has `approvalRequired` cleared;
6. the approval becomes `consumed` and cannot be replayed.

```bash
node packages/runtime/dist/cli.js --home .q1x approval request --file examples/security/example.approval-request.json
node packages/runtime/dist/cli.js --home .q1x approval decide approval.example.release --file examples/security/example.approval-decision.json
node packages/runtime/dist/cli.js --home .q1x approval apply approval.example.release
```

Other inspection commands are `approval list [--programme <id>]` and `approval show <id>`.

### Identity boundary

The current local JSON-first CLI does **not** provide cryptographic user authentication or an enterprise IAM service. Actor identifiers in approval documents are asserted by the caller. `requiredApproverKinds` is therefore a governance contract boundary, not a substitute for operating-system account security, filesystem permissions, signed identity or a future authenticated multi-user control plane.

## Immutable evidence

Evidence identifiers are single-write. Re-recording the same evidence ID is rejected instead of silently replacing provenance.

Phase 9 evidence can reference the execution and result that produced it and can carry a content digest:

```bash
node packages/runtime/dist/cli.js --home .q1x evidence record --file examples/security/example.evidence.json --programme programme.example
node packages/runtime/dist/cli.js --home .q1x evidence list --programme programme.example
node packages/runtime/dist/cli.js --home .q1x evidence show evidence.example.release-test
```

`sha256` values are canonical 64-character lowercase hexadecimal strings; `sha512` values are 128-character lowercase hexadecimal strings. The digest proves equality with the bytes a caller chose to hash; Q1X does not fabricate or infer a digest when source bytes are unavailable.

## Security audit receipts

Security-relevant governance actions write a separate metadata-only audit receipt chain. Each receipt contains:

- monotonic sequence number;
- event type and subject reference;
- optional programme scope;
- bounded metadata;
- previous receipt digest;
- SHA-256 digest of the canonical receipt body;
- occurrence timestamp.

Before persistence, metadata keys resembling credentials or session material are recursively replaced with `[REDACTED]`. This includes authorization headers, cookies, passwords, secrets, tokens, API keys, credentials and sessions.

```bash
node packages/runtime/dist/cli.js --home .q1x audit list
node packages/runtime/dist/cli.js --home .q1x audit verify
```

`audit verify` recomputes the chain from sequence 1 and reports the first invalid sequence when a stored receipt or link has changed. The local health/readiness service verifies the audit chain before entering ready state. Detected corruption is fail-closed.

### Audit threat-model limit

The hash chain detects modification, broken links and reordering of retained receipts. It is **not an external transparency log**. A party with unrestricted ability to rewrite the entire local database can potentially remove a complete tail of receipts and all corresponding state. Detecting that class of truncation requires an independently anchored digest, signed log or remote witness, which is outside the current single-node Community runtime.

## Restart recovery

A process restart can leave durable work assignments whose last state is `running`. Phase 9 does not assume that such work succeeded or failed.

```bash
node packages/runtime/dist/cli.js --home .q1x recovery reconcile --programme programme.example
```

Reconciliation:

1. groups abandoned running assignments by programme;
2. creates a checkpoint before mutation;
3. marks assignments `interrupted` with `RUNTIME_INTERRUPTED`;
4. changes matching running work nodes to `blocked`;
5. records recovery audit metadata;
6. restores the checkpoint if reconciliation itself fails.

Normal supervision policy can subsequently decide whether blocked work is retried, replaced or replanned.

The local service performs audit verification and interrupted-work reconciliation before reporting readiness.

## Backup and restore

The runtime database contains orchestration state, approvals, evidence, checkpoints, normal runtime events and the Phase 9 security audit receipts. Treat it as one consistency unit.

For a filesystem-level backup, stop the local service/container cleanly before copying the runtime home. This avoids taking `state.sqlite` separately while SQLite WAL state is still active. Alternatively use a SQLite-aware online backup mechanism that captures a consistent database snapshot.

After restore, run:

```bash
node packages/runtime/dist/cli.js --home <restored-home> audit verify
node packages/runtime/dist/cli.js --home <restored-home> recovery reconcile
```

Do not mark a restored runtime ready if audit verification reports an invalid chain.

## Content and privacy boundary

Routine security audit receipts are metadata-oriented. They must not copy model prompts or outputs, browser page/session content, desktop UI text, typed values, cookies, credentials, authorization headers or binary artifacts into the audit chain. Evidence and artifacts are separate explicit contracts and should contain only material the operator intentionally chooses to retain.

## What Phase 9 does not claim

Phase 9 does not provide enterprise IAM, cryptographic approver identity, remote attestation, HSM-backed signing, an externally witnessed transparency log, confidential-computing isolation or a hosted multi-tenant security boundary. Those capabilities may be implemented by future deployment/control-plane layers without changing the provider-neutral Community contracts.
