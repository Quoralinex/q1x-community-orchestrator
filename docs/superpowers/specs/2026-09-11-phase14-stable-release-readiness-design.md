# Phase 14 — Stable Release Readiness Design

**Status:** approved design
**Repository:** `Quoralinex/q1x-community-orchestrator`  
**Baseline:** protected `main` at `dd8bd0b53106fe5db60743c66bd3c1709fa95425`  
**Candidate target:** `1.0.0-rc.1`  
**Stable commissioning target:** `1.0.0`, separately authorised

## 1. Purpose

Phase 14 turns the hardened standalone Community baseline into a stable-release candidate without expanding the product into a hosted or distributed control plane.

The phase establishes explicit compatibility, migration, rollback, reliability and release-evidence contracts that are strong enough to support a later `1.0.0` decision. It does not itself commission `1.0.0`.

`0.2.0-beta.1` remains a beta-ready source line and may remain uncommissioned. Phase 14 source development is not contingent on creating a beta tag or release.

## 2. Design principles

1. **Stability before scope.** Do not add major new orchestration capabilities while closing the stable contract.
2. **Backward compatibility is tested evidence.** Compatibility claims require executable upgrade and consumer fixtures.
3. **No silent migration.** Durable-state changes are explicit, inspectable and recoverable.
4. **Stable means bounded promises.** Only documented public surfaces receive compatibility guarantees.
5. **Release evidence is exact-head evidence.** Artifacts, manifests, attestations and checks must identify the protected-main source SHA.
6. **Local-first remains first-class.** Stable readiness must not require paid model calls, private services or cloud databases.
7. **Failure must be recoverable or explicit.** Uncertain state, migration failure and incompatible rollback fail closed.
8. **No production/SLA implication.** A stable API contract is not an enterprise availability or security certification claim.

## 3. Scope

Phase 14 delivers five stability contracts:

- public contract/API/CLI compatibility;
- durable-state upgrade and rollback;
- package and release provenance;
- long-duration reliability and recovery evidence;
- stable documentation, deprecation and support policy.

The implementation may refactor internal code only where required to make those contracts enforceable. It must not introduce unrelated feature work.

## 4. Explicit non-goals

Phase 14 does not add PostgreSQL, object storage, distributed workers, hosted multi-tenancy, enterprise IAM, HSM-backed signing, remote attestation, confidential computing, a plugin marketplace, automatic third-party adapter trust, production SLA commitments or a mandatory Q1X Control Plane dependency.

It also does not commission `v0.2.0-beta.1`, `v1.0.0-rc.1` or `v1.0.0`. All immutable release actions remain separate authorities.

## 5. Stable public-surface contract

The stable surface is the set of interfaces that users can reasonably depend on after `1.0.0`:

- JSON Schema `v1` contract identifiers and required semantics;
- documented TypeScript package exports;
- documented `q1x` CLI command names, flags, machine-readable JSON envelopes and exit behavior;
- connector/profile document shapes that are explicitly documented as public;
- package names and supported Node/runtime baseline;
- durable-state compatibility rules and backup/restore format guarantees.

Phase 14 adds a repository-owned public-surface inventory. The inventory records package exports, schema digests, CLI catalogue entries and governed configuration keys in deterministic machine-readable form.

CI compares the current surface with the accepted baseline. Removal, incompatible type narrowing, command deletion, schema breakage or undocumented behavioral incompatibility fails closed unless the change is explicitly classified as pre-stable cleanup before the RC baseline is frozen.

Once the `1.0.0-rc.1` baseline is accepted, any further breaking public-surface change requires either a new RC line with an explicit migration note or deferral to a future major version.

Internal implementation details, undocumented test helpers and private module paths are not stable API merely because they are present in the repository.

## 6. Deprecation and semantic-version policy

Stable deprecations require a documented replacement, migration guidance and a machine-readable deprecation marker where the surface supports one. Deprecated stable surfaces are not removed in a minor or patch release.

Version policy after `1.0.0` follows semantic-version intent: patch releases must be backward-compatible fixes, minor releases may add compatible functionality, and breaking public-surface changes require a new major line.

Pre-stable historical behavior remains documented as historical evidence and is not retroactively promised as stable API.

## 7. Durable-state upgrade and rollback contract

Phase 14 introduces an explicit state-migration registry rather than relying on ad hoc startup behavior.

Each migration step declares source schema version, target schema version, deterministic preconditions, forward action, verification and whether rollback is mechanically supported. Migrations execute transactionally wherever SQLite permits it and must leave no partially advanced schema marker after failure.

The current state schema must not be bumped merely to exercise the framework. If no data-model change requires a new schema, stable readiness may retain schema version 1 while still shipping and testing the migration engine.

Before any destructive or irreversible migration, the CLI requires a verified backup unless the operator explicitly supplies a documented non-destructive test/dry-run mode. The backup digest and migration source/target versions are recorded in metadata-only audit evidence.

Required CLI behavior includes migration inspection, dry-run, apply and compatibility reporting. Automatic startup may detect that migration is required, but must fail closed rather than silently perform an irreversible migration.

Downgrade is not promised. Where the previous runtime cannot safely read a newer schema, rollback means restoring the verified pre-migration backup with the previous compatible runtime.

## 8. Upgrade evidence matrix

Stable readiness requires executable upgrade evidence from three supported starting points: a fresh empty home, a retained `v0.1.0-alpha.2` fixture, and the accepted Phase 13 `0.2.0-beta.1` state fixture.

Each fixture is upgraded through the exact supported path, reopened, verified for SQLite integrity and audit continuity, exercised through representative reads/writes, backed up again, and restored into a clean target.

A deliberately failing migration fixture must prove atomic rollback or explicit recovery behavior without fabricating success.

Upgrade evidence records only bounded metadata: source release/schema, target release/schema, source SHA, fixture digest, result, integrity outcome and recovery outcome. User content, credentials, prompts and machine-specific paths are excluded.

## 9. Package and consumer stability

The eight governed public packages remain one version-aligned release set with exact internal Q1X package dependencies.

Phase 14 adds a stable package-surface snapshot covering package names, export maps, executable bins, licence, engines, internal dependency graph and packed-file inventory. Clean external-consumer tests install only the packed artifacts, never workspace links.

The candidate version is `1.0.0-rc.1`. Package manifests move to that version only after all compatibility/migration foundations are in place and the release-facing tests are ready to enforce the RC identity.

The eventual `1.0.0` stable release must be built from protected `main` through a separate governed workflow. Phase 14 may prepare and validate that workflow, but release creation defaults to disabled.

## 10. Release provenance and integrity

Stable-readiness artifacts include the eight tarballs, deterministic package inventory, `release-manifest.json`, `SHA256SUMS`, SPDX 2.3 SBOM, reproducibility evidence, public-surface inventory and migration/upgrade evidence summary.

Every artifact set is tied to an exact 40-character source SHA. A stale source SHA, moved protected `main`, conflicting existing tag/release, checksum mismatch or surface-inventory mismatch fails closed.

Where GitHub-native artifact attestation is available, the stable commissioning workflow should emit build provenance for the governed bundle using least-privilege OIDC. Attestation strengthens provenance evidence but does not replace SHA-256 verification or reproducibility checks.

## 11. Reliability evidence

PR verification remains bounded and deterministic. It must not require paid provider calls or an hours-long soak on every change.

Stable readiness raises the acceptance threshold beyond Phase 13 with two separate evidence classes:

- bounded PR stress/restart tests that exercise migration, backup/restore, audit verification, browser/desktop lifecycle cleanup and supervision recovery;
- a manual/scheduled local-only acceptance soak of at least six hours against an exact candidate SHA.

The six-hour soak must continuously verify SQLite integrity, audit-chain validity, resource ceilings and clean external-operation convergence while making zero external provider calls. It must retain iteration count, peak memory, handle/file-descriptor observations and exact elapsed time.

A separate restart/recovery campaign must exercise at least 1,000 controlled open/close/reconcile cycles with deterministic local fixtures. Failures remain evidence; tests do not retry away a broken invariant.

Long-running evidence is accepted only when the tested SHA is runtime-equivalent to the final candidate or when the evidence is regenerated against the final exact head. Runtime-equivalence must be demonstrated by an explicit changed-path policy, not asserted informally.

## 12. Security and dependency gates

Existing CodeQL, standalone-boundary scanning, metadata redaction, approval/audit tests and full-SHA workflow pinning remain mandatory.

Phase 14 adds release-facing dependency and licence inventory checks. Network-dependent vulnerability lookups may run in scheduled/commissioning lanes rather than making every local PR gate depend on external service availability.

A vulnerability scanner result is evidence, not a security certification. Stable release is blocked by known unresolved critical vulnerabilities in shipped runtime dependencies unless the finding is demonstrably false-positive or non-reachable and the exception is documented with review evidence.

## 13. Documentation and support contract

Active documentation must distinguish historical Alpha/Beta material from the current RC/stable contract. Historical release pages remain unchanged except for clearly labelled navigation or archival context.

Phase 14 adds or strengthens:

- a stable compatibility/versioning policy;
- an upgrade and rollback guide;
- a deprecation policy;
- a supported-platform/runtime policy tied to the compatibility matrix;
- a stable-release checklist and release-evidence guide;
- explicit nonclaims covering enterprise IAM, distributed operation and production/SLA support.

The generated CLI reference, package/API surface inventory and compatibility matrix must agree with executable source. Documentation drift is a failing gate.

Stable `1.0.0` means the documented public interfaces are governed by the compatibility policy. It does not mean every possible provider, browser, desktop application, operating-system version or third-party adapter is supported.

## 14. CI and commissioning architecture

Add a read-only `stable-readiness.yml` workflow for exact-head RC evidence. It runs the bounded repository, migration, compatibility, consumer, reproducibility and security gates and uploads machine-readable evidence.

Long-soak and restart-campaign jobs are manual/scheduled and isolated from ordinary PR latency. Their artifacts must identify the exact source SHA and duration/cycle thresholds.

Prepare a separate `public-stable.yml` commissioning workflow with explicit inputs for governed version, `release` and `publish_npm`. Both mutation switches default to `false`.

The stable release job may run only from protected `main`, only for the governed `1.0.0` identity, only after validation succeeds, and only when the tag/release does not already exist. npm publication remains a separate trusted-publishing action that additionally requires `publish_npm=true`.

No Phase 14 implementation task may invoke `public-stable.yml` with release authority. Stable commissioning remains a later explicit human decision.

## 15. Architecture boundaries

Community Orchestrator remains standalone, provider-neutral and OS-neutral. Ordinary use must not depend on Q1X Control Plane, private Quoralinex services, private endpoints, private package registries or proprietary authority callbacks.

The supported stable baseline remains single-node SQLite/filesystem operation. Future distributed profiles must layer behind existing contracts rather than making the stable local baseline depend on them.

External side effects remain fail-closed on uncertainty. Stable readiness does not broaden automatic retries for non-idempotent provider, browser, desktop or adapter operations.

PolyForm Noncommercial License 1.0.0 remains the default licence for the public repository and every governed public package.

## 16. Candidate and release identities

Phase 14 has three distinct identities:

1. **Phase 13 beta-ready source:** `0.2.0-beta.1`, historical input to Phase 14.
2. **Phase 14 stable-readiness candidate:** `1.0.0-rc.1`, produced by implementation and evidence gates but not automatically released.
3. **Stable commissioning target:** `1.0.0`, created only through separate explicit release authority from accepted protected `main`.

The RC candidate may be validated without being commissioned as a public GitHub release. Stable `1.0.0` must never be inferred from source versioning, documentation or successful CI alone.

If implementation reveals a required breaking public-surface cleanup after the RC baseline is frozen, the candidate increments to a later RC rather than mutating the accepted RC identity.

## 17. Completion criteria

Phase 14 implementation is complete only when every criterion below has fresh exact-head evidence:

- deterministic public-surface inventory exists and incompatible drift fails closed;
- stable semantic-version and deprecation policies are documented and tested;
- explicit state migration inspection/dry-run/apply behavior exists;
- fresh, Alpha 2 and Phase 13 state fixtures upgrade and verify successfully;
- migration failure proves atomic rollback or explicit recoverability;
- backup/restore remains valid across the supported upgrade path;
- eight governed packages are aligned at `1.0.0-rc.1` with exact internal versions;
- external packed-consumer tests pass from only the governed tarballs;
- reproducibility, checksums, SBOM and public-surface evidence are tied to exact source SHA;
- bounded PR stress/restart tests pass with zero provider billing;
- accepted six-hour soak and 1,000-cycle restart/recovery evidence are retained;
- CodeQL, compatibility, packaging, product-usability, standalone and Phase 14 completion gates are green;
- active docs describe RC/stable policy without claiming `1.0.0` has been commissioned;
- no private-service dependency or publication-unsafe evidence is introduced;
- `public-stable.yml` validates safely with release and npm mutations disabled by default.

## 18. Test strategy

Implementation follows strict TDD. New migration, surface-inventory, upgrade-fixture and commissioning behavior is first specified by failing focused tests.

Fast PR tests use temporary local state, deterministic loopback/fixture transports and bounded workloads. Long-running tests remain separate manual/scheduled evidence lanes.

Every release-facing workflow change has repository tests for permissions, full-SHA action pinning, exact version identity, mutation defaults, protected-main guards and immutable-tag refusal.

Compatibility claims use the existing evidence-tier model. Fixture and hosted-runner evidence must never be promoted to physical-host evidence. A blocked physical host remains blocked.

## 19. Principal risks and mitigations

**Risk: accidental over-promise at 1.0.** Mitigation: define the stable surface narrowly and preserve explicit nonclaims.

**Risk: migration corrupts user state.** Mitigation: verified backup requirement, deterministic preconditions, transactional steps, post-migration integrity/audit checks and restore-based rollback.

**Risk: stale Alpha/Beta assumptions contaminate stable CI.** Mitigation: historical-release tests use synthetic historical identities while current-source checks use the RC/stable identity.

**Risk: long-running evidence becomes stale after code changes.** Mitigation: exact-SHA evidence or formally verified runtime-equivalence changed-path policy.

**Risk: stable release workflow accidentally publishes.** Mitigation: separate validation/release/npm jobs with explicit booleans defaulting false and immutable tag/release guards.

## 20. Resolved design decisions

- Phase 14 is stability work, not distributed-platform expansion.
- The implementation target is `1.0.0-rc.1`; stable `1.0.0` remains separately commissioned.
- Beta commissioning is not a prerequisite for Phase 14 source development.
- The existing single-node standalone architecture remains the stable baseline.
- State schema version 1 is retained unless implementation genuinely requires a schema change.
- Six hours is the minimum stable-readiness soak; longer evidence is acceptable, shorter evidence is not.
- The restart/recovery acceptance campaign minimum is 1,000 deterministic cycles.
- npm publication remains optional and independently authorised.
- Public repository and package licensing remains PolyForm Noncommercial License 1.0.0.

## 21. Expected implementation decomposition

The implementation plan should decompose this design into independently reviewable tasks for: public-surface inventory, migration engine, upgrade fixtures, package/consumer stability, reliability campaigns, release provenance, stable documentation, RC identity, completion gates, and exact-head review/merge.

Each task should preserve a green baseline, use a dedicated commit, and avoid crossing any immutable release boundary. The final implementation task stops with an accepted protected-`main` RC-ready SHA and reports the evidence required for a later stable commissioning decision.
