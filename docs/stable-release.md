# Stable release readiness

Phase 14 prepares `1.0.0-rc.1` as the Q1X Community Orchestrator stable-readiness candidate. `1.0.0` is not commissioned by the current source state, and this page does not claim that a stable release already exists.

## Required evidence before stable commissioning

Stable commissioning must be tied to an exact protected-`main` commit after the complete repository gate and exact release workflow are green. The evidence set includes:

- frozen public and packed-package compatibility inventories for all eight governed packages;
- executable fresh, `v0.1.0-alpha.2` and `0.2.0-beta.1` upgrade/restore evidence;
- at least a six-hour (360 minute) local-only stable soak with SQLite integrity, valid audit evidence, resource observations, no unresolved external operations, no limit breaches and zero external-provider calls;
- a 1,000-cycle restart/recovery campaign exercising real interrupted-operation reconciliation;
- reproducible eight-package artifacts, SHA-256 checksums, packed-consumer verification and an SPDX SBOM;
- deterministic production dependency and licence evidence plus the commissioning-only critical-vulnerability gate;
- tested/experimental/unsupported platform evidence and the documented physical-host limitations;
- exact-head CI, independent review and post-merge verification before any immutable release action.

## Compatibility promise

A commissioned stable release would govern only the surfaces frozen in `compatibility/public-surface.rc1.json` and `compatibility/package-surface.rc1.json`, together with the documented durable-state migration contract. It would not silently guarantee private implementation details or every provider/browser/desktop combination.

## Commissioning boundary

Creating `v1.0.0`, a GitHub stable release, or npm packages is an immutable distribution action and remains separately authorised from implementation/readiness work. The current candidate must therefore continue to say that `1.0.0` is not commissioned until that explicit authority is exercised from the exact verified `main` SHA.

## Explicit nonclaims

Stable-readiness evidence is not a claim of enterprise IAM, HSM-backed identity, remote attestation, confidential-computing isolation, external audit witnessing, multi-tenant hosted control plane, universal hardware/application compatibility, production certification or an SLA. No production or SLA guarantee is made by the Phase 14 candidate.

The public project remains licensed under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial use; commercial use requires the separate commercial-licensing path.
