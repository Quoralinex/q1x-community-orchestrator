# Q1X Community Orchestrator v0.1.0-alpha.1

This is the first governed **public alpha** of Q1X Community Orchestrator. It is experimental software for evaluation, local development and Community testing. It is not production-ready, generally available or covered by an enterprise support commitment.

The authoritative source commit for each commissioned release is recorded in the attached `release-manifest.json`; the workflow creates the `v0.1.0-alpha.1` tag only after validating that exact protected `main` commit. Do not substitute a feature-branch artifact or an edited release attachment for the governed bundle.

## Included artifacts

- `@quoralinex/q1x-community-contracts` `0.1.0-alpha.1` package tarball;
- `@quoralinex/q1x-community-sdk` `0.1.0-alpha.1` package tarball;
- `@quoralinex/q1x-community-runtime` `0.1.0-alpha.1` package tarball;
- `release-manifest.json` with version, tag, exact source SHA and artifact metadata;
- `SHA256SUMS` for the three package tarballs.

Verify the checksums and manifest before installation.

## Major capability baseline

The alpha includes the provider-neutral contract/runtime foundation, capability discovery, model transports, MCP/A2A/CLI adapters, browser control, desktop bridge contracts, dynamic team formation, adaptive supervision, cross-platform source/Docker packaging, and Phase 9 approval/evidence/audit/recovery hardening.

## Installation

See `docs/public-alpha.md` for the verified source, packed-package and Docker paths. The runtime preserves a zero-provider-bill local baseline; model providers and credentials are optional operator-supplied capabilities.

## Security

Security reports follow `SECURITY.md`. Consequential work is governed by fail-closed single-use approvals, evidence is immutable by identifier, security audit metadata is hash-linked and recursively redacted, and service readiness fails closed on detected audit-chain corruption.

Current actor identifiers are not cryptographically authenticated, and the local audit chain is not an externally anchored transparency log. See `docs/known-limitations.md` before using the alpha for consequential workflows.

## Upgrade and rollback

Back up the complete runtime home before upgrading. After upgrade or restore, verify the audit chain, reconcile interrupted work when relevant, and confirm runtime readiness/status before resuming work. If a future release changes durable state incompatibly, rollback requires the matching pre-upgrade state backup as well as the prior executable/package/image.

## Compatibility scope

Phase 10 verifies current GitHub-hosted Ubuntu, macOS and Windows source-install paths, the Linux Docker/OCI path, package contents, and a clean external consumer of the generated Q1X tarballs. It does not claim universal provider, browser, desktop-backend or protocol compatibility.

**Phase 11** will provide the formal tested/experimental/unsupported compatibility matrix and the Community Adapter SDK.

## Licence

The release remains under the PolyForm Noncommercial License 1.0.0 for permitted non-commercial use. Commercial use requires a separate licence from Quoralinex.
