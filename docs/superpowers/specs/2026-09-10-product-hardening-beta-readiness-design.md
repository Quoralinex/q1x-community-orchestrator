# Phase 13 Product Hardening & Beta Readiness Design

**Repository:** `Quoralinex/q1x-community-orchestrator`
**Base:** commissioned `v0.1.0-alpha.2` and protected `main`
**Date:** 10 September 2026
**Status:** Approved for implementation planning

## Purpose

Phase 13 hardens the completed standalone product baseline so Q1X Community Orchestrator can move from a functional public alpha toward a credible beta candidate. The phase concentrates on reliability, recoverability, bounded execution, reproducible delivery, compatibility evidence and usable operating documentation rather than adding new capability domains.

The target is a beta-ready candidate, not a production or general-availability claim. Phase 13 may prepare `0.2.0-beta.1` release governance, but creating an immutable beta tag/release remains an explicit commissioning action after the readiness gate passes.

## Architectural boundary

The Phase 12 standalone architecture remains authoritative. Q1X Community Orchestrator owns its runtime state, supervision, approvals, evidence, audit, recovery, connector configuration and diagnostics locally. No Q1X Control Plane, private Quoralinex service, hosted authority, proprietary continuity service or mandatory cloud component is introduced.

Phase 13 does not add enterprise IAM, distributed workers, PostgreSQL/object-storage deployment, multi-tenant hosting, a marketplace, automatic third-party package execution, HSM-backed signing or paid infrastructure. Those are separate future architectural decisions.

## Beta-readiness principles

1. **Fail closed on uncertainty.** After a crash or ambiguous external side effect, Q1X records uncertainty/interruption and never invents success or automatically repeats a consequential action merely to regain progress.
2. **State before convenience.** Durable-state integrity, backup and restore correctness take precedence over seamless upgrades.
3. **Bound every execution path.** Child processes, model calls, MCP/A2A calls, browser sessions, desktop bridges, queues and supervision cycles must have explicit limits.
4. **Retry only where semantics are known.** Pure reads and stable-id local writes may be retry-safe; external side effects are not assumed idempotent.
5. **Evidence over claims.** Compatibility, reliability and release claims advance only when linked to reproducible tests or recorded host evidence.
6. **No hidden service dependency.** Hardening must not weaken the standalone/public boundary or require private infrastructure.
7. **Cost-aware verification.** Deterministic PR gates stay bounded; longer soak/stress runs are manual or scheduled and produce retained evidence without consuming every-commit CI minutes.

## Reliability model

Phase 13 defines three execution outcomes around interruption: `completed`, `failed`, and `interrupted/uncertain`. A process crash between dispatching an external action and persisting its result cannot be converted retrospectively into success or failure without evidence from the external system. Such work remains blocked or reviewable until an operator or a supported reconciliation mechanism resolves it.

Local SQLite mutations that form one logical governance operation must either commit atomically or leave the prior durable state intact. Multi-step operations that cannot be one transaction must create a recovery boundary before the first irreversible local mutation and record enough metadata to reconcile after restart.

## Workstream 1 — Durable-state versioning, backup and restore proof

Introduce an explicit durable-state schema/version marker owned by the runtime. Opening a runtime home must distinguish supported current state, supported upgrade state and unsupported future/incompatible state before normal work begins.

Provide a first-party backup verification path that creates a consistent snapshot of the complete runtime home and records a manifest containing runtime version, state-schema version, source/release identity where known, SQLite integrity result and SHA-256 digests for included durable files. Backups must never copy environment-secret values into the manifest.

Restore is deliberately conservative. Phase 13 restores into a new or empty target runtime home, verifies checksums and SQLite integrity before readiness, then requires `audit verify` and `recovery reconcile` to pass before work resumes. In-place destructive overwrite is not a baseline Phase 13 feature.

Upgrade testing must include an `alpha.2` state fixture opened by the beta candidate. If a future schema migration is required, it must be versioned, transactional where possible, backup-first and covered by rollback tests. Downgrade means restoring the pre-upgrade backup and previous executable; Phase 13 does not promise that an older binary can open a state store already transformed by a newer incompatible migration.

Acceptance evidence covers clean backup/restore round trips, corrupt/incomplete backup rejection, future-schema rejection, interrupted backup handling, restored audit verification and restart after restore.

## Workstream 2 — Crash consistency and restart reconciliation

Add deterministic crash/failure-injection coverage around the major durable boundaries: approval application, execution-request persistence, assignment state transitions, evidence recording, audit receipt append, checkpoint creation/restore, connector configuration and supervision cycle updates.

Failure injection exists only in test harnesses or injected test dependencies; Phase 13 does not add a production environment variable that can intentionally corrupt or abort normal execution.

For external execution, the durable sequence is explicit: persist intent, dispatch, persist observed result, then advance dependent state. A crash before dispatch is safe to retry only when the intent remains undispatched. A crash after dispatch but before result persistence creates an interrupted/uncertain record and must not automatically repeat a potentially consequential operation.

On startup, reconciliation inspects nonterminal executions/assignments, validates the audit chain and state schema, and leaves each item in an evidence-supported state. Recovery events remain metadata-only and must not copy prompts, browser content, desktop text, credentials or other sensitive execution payloads into audit receipts.

Acceptance includes hard process termination at controlled boundaries, restart against the same runtime home, no duplicate terminal records, no silent loss of committed state and no fabricated completion.

## Workstream 3 — Concurrency and retry/idempotency semantics

The supported architecture remains single-node, but multiple local CLI invocations and overlapping supervision activity must not corrupt shared SQLite state or create duplicate logical records. Phase 13 therefore hardens transaction boundaries, lock/busy handling and retry behavior for concurrent access to one runtime home.

Stable-id local writes may be made idempotent where the existing contract already defines identity. A repeated request with the same identity and equivalent content may return the existing durable result; conflicting content under the same identity must fail explicitly rather than overwrite history.

External adapters, browsers, desktop actions and model/tool calls are not globally declared idempotent. Q1X may retry only when the transport/action contract proves retry safety or when no dispatch occurred. Otherwise the runtime records interruption/uncertainty and requires policy/operator resolution.

Concurrency tests must cover simultaneous reads/writes, competing revision updates, duplicate approval application, duplicate evidence ids, concurrent connector configuration, overlapping supervision cycles and SQLite lock contention. Tests must prove bounded retry/backoff and deterministic failure rather than indefinite blocking.

## Workstream 4 — Resource, timeout and cancellation budgets

Centralize operational ceilings that are currently distributed across transports into an explicit runtime hardening policy. Baseline limits cover maximum concurrent assignments, child-process lifetime, HTTP/model/tool timeout, response/output bytes, browser session count, desktop bridge batch duration, supervision cycle work count and bounded retry attempts.

Defaults must be conservative and suitable for a single-node developer/operator workstation. Invalid, zero/negative or unreasonably large settings fail validation. `q1x doctor --json` reports the effective non-secret operational limits and warns when operator overrides materially weaken the baseline.

Cancellation must propagate through model, adapter, browser, desktop and supervision paths wherever the underlying operation is cancellable. A cancellation that cannot prove the external side effect did not occur is recorded as interrupted/uncertain rather than cleanly cancelled.

## Workstream 5 — Failure-injection and resilience harness

Build a repository-owned deterministic resilience harness that can force representative failures without depending on unstable external services. Scenarios include transport timeout, connection refusal, malformed response, child-process nonzero exit/hang, bridge output overflow, browser termination, SQLite busy/transaction failure, damaged backup input and restart during supervision.

The harness must distinguish a deliberately injected test failure from a production configuration path and must never be enabled by an undocumented runtime switch. Each scenario records expected state before failure, expected error classification, expected durable state after failure and expected restart/recovery behavior.

Resilience evidence is machine-readable so compatibility/release gates can cite exact scenario ids and source SHAs. A passing resilience scenario proves only the tested failure boundary, not general fault tolerance.

## Workstream 6 — Stress, soak and performance budgets

Introduce two levels of reliability testing. The PR gate remains deterministic and bounded, exercising high-volume local state operations, repeated connector/doctor cycles, concurrent CLI activity and repeated supervision/recovery loops within a fixed time budget. Longer soak tests run manually or on a low-frequency schedule and are not required on every commit.

The soak lane repeatedly initializes, executes, checkpoints, recovers and verifies runtime state while tracking process exit status, unhandled rejections, SQLite integrity, audit-chain validity, open-handle leakage and bounded memory/file-descriptor growth. It must avoid paid model/provider calls by using deterministic local fixtures.

Phase 13 defines budgets rather than marketing benchmarks. A regression that exceeds the agreed CI time/resource ceiling fails the beta-readiness gate; performance numbers are not advertised publicly unless the exact hardware, workload and methodology are recorded.

## Workstream 7 — Reproducible release and supply-chain evidence

Extend release evidence so a beta candidate can be reconstructed and compared from a clean checkout. The release record includes exact source SHA, Node/npm versions, lockfile digest, governed package versions, package file inventories, SHA-256 content digests, licence identity, workflow run identity and the compatibility/reliability evidence baseline.

Reproducibility is defined conservatively: two clean builds from the same commit must produce the same governed package file inventory and the same digest for each unpacked package file. Byte-identical `.tgz` containers are additionally checked where the packaging toolchain is deterministic, but variable archive metadata must not be hidden or misrepresented as reproducibility failure/success.

Generate a machine-readable software bill of materials for the governed public package set from the exact lockfile/package graph. The SBOM is evidence, not a vulnerability guarantee. Existing full-SHA action pinning, least-privilege workflow permissions, CodeQL, standalone-boundary checks and PolyForm Noncommercial License 1.0.0 remain mandatory.

No paid signing service, private key infrastructure or proprietary attestation service becomes a beta prerequisite. If GitHub-native provenance/attestation is available without weakening the zero-cost public path, it may be added as supplemental evidence, but documentation must distinguish signed attestation from locally generated metadata.

## Workstream 8 — Expanded compatibility and real-host evidence

Retain the evidence taxonomy from Phase 11/12 and add an environment tier to distinguish deterministic fixture/harness evidence, hosted-runner evidence and physical-host evidence. No matrix entry may imply physical-host verification when only a CI harness or virtual machine was exercised.

Phase 13 should record physical-host evidence where suitable hosts are available, especially for desktop permission/session behavior and browser integration. Lack of physical evidence for a platform does not permit a false claim; that surface remains runner-tested or experimental with an explicit caveat.

Real-host evidence must record OS/version, architecture, Q1X source/release SHA, bridge/browser version where material, test scenario ids, pass/fail/blocked state and non-sensitive remediation notes. Credentials, usernames, hostnames and private paths are excluded from public evidence.

## Workstream 9 — User, operator and developer manuals

Phase 13 consolidates the operational knowledge required to use the shipped product without reconstructing commands from design documents or source code.

The **User Guide** covers installation choices, first run, connector setup, model/MCP/A2A/CLI/browser/desktop workflows, ordinary mission/programme execution, common diagnostics and safe shutdown/restart. It is task-oriented and uses copyable commands with expected outcomes.

The **Operator Guide** covers runtime-home management, effective limits, backup/restore, audit verification, recovery reconciliation, upgrade/rollback, release-artifact verification, compatibility interpretation, incident triage and known failure states.

The **Developer Guide** covers repository architecture, contracts, public SDKs, adapter development/conformance, test fixtures, compatibility evidence, release governance, contribution workflow and the standalone/private-service boundary.

A generated or tested command-reference appendix must stay aligned with the actual CLI surface. Documentation tests should fail when public commands, required prerequisites or release-status wording drift materially from the executable/product state.

## Workstream 10 — Beta readiness and release governance

Phase 13 prepares a separately governed `0.2.0-beta.1` candidate only after the hardening gate passes. All public packages remain version-aligned and internal dependencies remain exact for the commissioned candidate. The existing `v0.1.0-alpha.1` and `v0.1.0-alpha.2` tags/releases remain immutable historical evidence.

The beta workflow reuses the fail-closed release authority pattern: validate on normal changes, create an immutable beta tag/GitHub prerelease only through explicit manual commissioning from protected `main`, and keep npm publication a separate optional authority. Phase 13 completion does not require npm publication.

## Operator-facing command additions

The phase may add only the command surface required to make hardening usable rather than internal-only:

```text
q1x backup create --output <path>
q1x backup verify <path>
q1x backup restore <path> --home <empty-target>
q1x limits show
q1x doctor --json
```

`backup restore` refuses a non-empty target by default. Phase 13 does not add a force-overwrite shortcut. Existing status, audit, recovery and connector commands remain the normal post-restore and diagnostic surfaces.

Runtime-limit configuration follows the repository's existing non-secret configuration patterns. Secrets are never written into backup manifests, diagnostics, limits output or resilience evidence.

## Error classification and observability

New failure paths use stable structured error classes rather than stack-trace parsing. At minimum the implementation distinguishes incompatible state, backup-integrity failure, resource-limit exceeded, lock/contention timeout, interrupted/uncertain execution, unsupported recovery and release-evidence mismatch.

Human-readable CLI output may explain remediation, while JSON output retains deterministic fields for automation. Error records and audit receipts remain bounded and metadata-only; sensitive payloads are not copied merely to improve diagnostics.

## Verification strategy

Phase 13 uses layered evidence so fast checks remain useful while deeper reliability evidence is still obtained:

1. **Unit/contract tests:** state-version rules, backup manifests, limits, error classification and retry decisions.
2. **Deterministic integration tests:** concurrent SQLite access, crash boundaries, restore/restart, cancellation, transport/bridge failures and external-side-effect uncertainty.
3. **Cross-platform product gates:** Ubuntu, macOS and Windows source/package tests plus Docker remain mandatory.
4. **Bounded PR stress gate:** high-volume local fixtures with fixed iteration/time ceilings and no paid provider calls.
5. **Manual/scheduled soak gate:** longer repeated lifecycle/recovery workload with machine-readable evidence; one accepted soak run is required for beta-readiness evidence, but the lane is not run on every commit.
6. **Release reproducibility gate:** clean rebuild comparison, SBOM generation, package inventory/content digest comparison and release-manifest validation.
7. **Real-host evidence:** recorded separately from runner/harness evidence and promoted in the compatibility matrix only at the level actually exercised.

All existing Repository Baseline, Runtime and Contracts, CodeQL, Compatibility Matrix, Cross-platform Packaging, Product Usability, standalone verification and public-release governance gates must remain green.

## Phase 13 completion gate

Phase 13 is complete only when the accepted `main` commit demonstrates all of the following: consistent state-version handling; verified backup/restore; deterministic crash/restart behavior; explicit uncertain external-side-effect handling; bounded concurrency/retry semantics; effective operational ceilings and cancellation behavior; failure-injection coverage; an accepted bounded stress run and longer soak evidence; reproducible governed package contents; machine-readable supply-chain evidence; updated compatibility evidence with honest runner/physical-host distinction; complete User, Operator and Developer manuals; and preserved standalone/public/private/licence boundaries.

The completion verifier must be machine-readable and fail closed when any required evidence identifier, package version, documentation surface or hardening gate is missing.

## Beta commissioning boundary

Passing Phase 13 means the source is beta-ready; it does not silently create or publish a beta. The subsequent manual commissioning step binds `v0.2.0-beta.1` to the exact accepted protected-`main` SHA, regenerates and verifies all governed artifacts, records the reliability/compatibility evidence baseline and creates the GitHub prerelease only if every release gate agrees.

Any npm publication remains independently explicit. A GitHub beta prerelease is valid without npm, just as the current Alpha 2 release is valid without npm publication.

## Explicit non-goals

Phase 13 does not claim or deliver enterprise IAM, multi-user authentication, external audit anchoring, exactly-once execution across arbitrary external systems, distributed consensus, high availability, multi-node workers, hosted SaaS control, production SLAs, universal desktop automation, universal provider compatibility, automatic marketplace trust or automatic recovery from unknown external side effects.

Those limitations must remain visible in public documentation until separately designed, implemented and evidenced. Hardening a boundary is not permission to overstate that boundary.

## Documentation and claim integrity

README, GitHub Pages, manuals, compatibility documentation, release notes and known limitations must describe the evidence actually achieved. `beta-ready` may be used only after the Phase 13 completion gate passes. `beta` may be used as the current commissioned release only after an immutable beta release is actually created by the governed workflow.

The current `v0.1.0-alpha.2` release remains the authoritative commissioned public release throughout Phase 13 development. No Phase 13 branch, draft artifact or test result rewrites that immutable release history.
