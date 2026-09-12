# Q1X Community Orchestrator 0.2.0-beta.1 candidate

> **Historical Phase 13 context:** this page records the `0.2.0-beta.1` beta-ready candidate. The newer Phase 14 RC/stable-readiness status is documented in [Stable release readiness](stable-release.md).

`0.2.0-beta.1` is the governed Phase 13 **beta-ready candidate**. It is not a commissioned beta release until the separate `public-beta.yml` release authority is explicitly dispatched from protected `main` after every required gate is green.

The current commissioned public release remains `v0.1.0-alpha.2`. The historical `v0.1.0-alpha.1` and `v0.1.0-alpha.2` tags and release artifacts remain immutable.

## What the candidate adds

- durable state-schema compatibility and SQLite integrity checks;
- verified backup, verification and conservative restore;
- crash-consistent external-operation journalling and uncertain-outcome recovery;
- central execution limits, deterministic conflict handling and retry classification;
- deterministic resilience, bounded stress and long-soak evidence lanes;
- reproducible package inventories and SPDX 2.3 SBOM evidence;
- explicit fixture, hosted-runner and physical-host compatibility evidence tiers;
- consolidated User, Operator, Developer and generated CLI manuals.

The eight governed public packages are version-aligned at `0.2.0-beta.1` with exact internal Q1X package dependencies.

## Evidence required before commissioning

A beta release may be commissioned only from the exact protected-`main` SHA after Repository Baseline, Runtime and Contracts, CodeQL, Compatibility Matrix, Cross-platform Packaging, Product Usability, Beta Readiness, standalone verification, Phase 13 completion verification and independent review are green.

The first accepted beta-readiness record also requires an exactly 60-minute deterministic local-only soak. Physical-host evidence is recorded only where an actual host was exercised; blocked host permissions remain honestly `blocked` and are not promoted by inference.

Release artifacts include the eight package tarballs, `release-manifest.json`, `SHA256SUMS`, `package-inventory.json`, SPDX 2.3 SBOM and reproducibility evidence tied to the exact source SHA.

## Distribution boundary

GitHub prerelease creation and npm publication are separate authorities. A successful GitHub beta prerelease does not imply npm publication. npm remains optional and uses trusted OIDC publishing only when separately approved.

## Status and nonclaims

The candidate remains experimental. Beta readiness is not a production-readiness, SLA, universal compatibility, enterprise-IAM, distributed-control-plane or security-certification claim. The standalone, provider-neutral architecture remains unchanged and ordinary Community operation has no mandatory private Quoralinex service or Q1X Control Plane dependency.

See [Known limitations](known-limitations.md), [Operator Guide](operator-guide.md), [Compatibility Matrix](compatibility-matrix.md) and the historical [Public alpha guide](public-alpha.md).
