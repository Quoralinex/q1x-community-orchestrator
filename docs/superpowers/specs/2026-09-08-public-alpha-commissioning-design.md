# Phase 10 Public Alpha Commissioning Design

## Purpose

Commission the first governed public alpha of Q1X Community Orchestrator from the verified Phase 9 `main` baseline without weakening the project’s provider-neutral, OS-neutral, local-first, non-commercial Community boundaries.

Phase 10 turns the existing pre-alpha implementation into a reproducible public-alpha release surface. It does not add new orchestration capability domains; instead it makes the capabilities already delivered through Phases 1–9 installable, verifiable, supportable and releasable as one coherent alpha.

## Release model

Use a hybrid fail-closed release model.

1. GitHub is the authoritative public-alpha release surface.
2. The first release line is `v0.1.0-alpha.1`.
3. The distributable contracts, TypeScript SDK and runtime packages remain version-locked at `0.1.0-alpha.1` for the first alpha.
4. The root workspace remains private/non-publishable and is never released as an npm package.
5. GitHub source archives are supplemental; the governed release artifacts are generated package tarballs, checksums and release metadata produced by the release workflow.
6. npm publication is supported only through an explicit release lane. It is not required for a valid GitHub alpha.
7. If npm publication is enabled, the preferred authentication model is npm Trusted Publishing/OIDC. A missing or invalid publication authority must fail closed rather than fall back silently to an embedded or long-lived registry credential.
8. All release surfaces remain clearly labelled public alpha / pre-release. Phase 10 must not imply production readiness, general availability or an enterprise support commitment.

## Authoritative release identity

A release is identified by the tuple:

- semantic version, for Phase 10 initially `0.1.0-alpha.1`;
- Git tag `v0.1.0-alpha.1`;
- exact source commit SHA from protected `main`;
- generated package tarball names and SHA-256 digests;
- release manifest version.

The release workflow must reject a requested version/package mismatch, package-version mismatch, stale source reference, or internal dependency version mismatch.

## Package set

The Phase 10 release set is limited to the existing public packages:

- `@quoralinex/q1x-community-contracts`
- `@quoralinex/q1x-community-sdk`
- `@quoralinex/q1x-community-runtime`

All three must use the same alpha version. Internal dependencies must reference that exact version rather than broad ranges for the commissioned alpha.

The Docker image remains an installation/deployment artifact built from the same source release, but Phase 10 does not require a public container registry. A local reproducible Docker build remains a valid zero-cost path.

## Commissioning workflow

Introduce a dedicated GitHub Actions public-alpha commissioning workflow with two modes.

### Validation mode

Runs on pull requests affecting release, package, documentation or commissioning files and may also be invoked manually. It performs all release checks without creating tags, releases or external publications.

### Release mode

Runs only through an explicit manual dispatch against protected `main`. The operator supplies the intended alpha version and the workflow binds the candidate to its exact checked-out `main` commit SHA.

Release mode performs the complete validation suite first. Only after every gate succeeds may the workflow create the matching `v<version>` tag at that exact SHA, generate the governed artifacts and create the GitHub prerelease. If the tag already exists at a different commit, or a release with that tag already exists, the workflow fails closed. Ordinary tag pushes are not an alternate release-authority path.

Release mode must not publish to npm merely because release authority was granted. npm publication requires a separate explicit condition/input/environment authority and must fail closed if that authority is absent.

## Release gates

A Phase 10 release candidate is accepted only when all of the following succeed on the exact source commit:

1. Repository Baseline.
2. Runtime and Contracts.
3. CodeQL.
4. Native source-install verification on Ubuntu, macOS and Windows.
5. Docker build, non-root runtime, health/readiness and persistent-state restart verification.
6. Package-version and dependency-alignment checks.
7. `npm pack` generation for all three public packages.
8. Clean external-consumer installation from the generated tarballs.
9. External-consumer import/type smoke tests.
10. External-consumer CLI smoke test for the packed runtime.
11. Release manifest/checksum verification.
12. Required public-alpha documentation checks.
13. PolyForm Noncommercial License 1.0.0 inclusion/visibility checks.
14. Public/private boundary checks.

No tag or release creation occurs if any gate fails.

## External consumer verification

Workspace tests are necessary but insufficient for commissioning because workspace linking can hide packaging defects. Phase 10 therefore adds a clean consumer test that operates outside the monorepo workspace.

The test must:

1. build the repository;
2. run `npm pack` for contracts, SDK and runtime;
3. create an empty temporary consumer project;
4. install the three local tarballs with package-manager lifecycle scripts disabled where practical;
5. import the SDK and runtime from their public package entry points;
6. compile a strict TypeScript consumer against the packed SDK;
7. invoke the packed `q1x` CLI to initialise a temporary runtime home;
8. verify the CLI returns the expected JSON/status contract;
9. remove the temporary consumer state after the test.

The test must not depend on npm registry availability, provider credentials, hosted model APIs or private Q1X infrastructure.

## Release manifest and integrity artifacts

Each GitHub alpha release must contain a machine-readable release manifest recording at minimum:

- release-manifest format version;
- Q1X Community Orchestrator semantic version;
- Git tag;
- exact source commit SHA;
- Node.js baseline;
- package names and versions;
- package tarball filenames;
- SHA-256 digest for every attached package tarball;
- expected licence identifier/text reference;
- supported commissioning targets: macOS, Windows, Linux and Docker;
- release status `public-alpha`;
- generation timestamp.

A human-readable checksum file should accompany the manifest. Verification tests must recompute artifact hashes and compare them with the manifest before release completion.

The manifest is release evidence, not a remote attestation system. Phase 10 does not introduce Sigstore, third-party transparency logs or paid signing infrastructure unless already available without changing the zero-cost baseline.

## GitHub prerelease

The first public alpha is a GitHub prerelease, not a production release.

The release notes must contain:

- alpha status warning;
- exact source SHA;
- install paths;
- included packages and versions;
- major capabilities delivered through Phases 1–9;
- known limitations;
- security reporting path;
- upgrade/rollback guidance;
- compatibility summary pointing to the tested Phase 10 commissioning targets;
- explicit statement that Phase 11 will provide the broader formal compatibility matrix and Community Adapter SDK.

The release must not claim support for untested model providers, desktop backends, browsers, operating-system variants or container platforms.

## Installation paths

Phase 10 must document and verify three public-alpha installation paths.

### Source installation

For users who want the zero-cost development/local path:

- Node.js 24+;
- clone/download source;
- `npm ci --no-audit --no-fund`;
- `npm run build`;
- initialise via the built `q1x` CLI.

### Packed-package installation

Document installation from the release tarballs. This path is authoritative even if npm publication is not enabled.

### Docker installation

Document local image build and Compose use from the tagged source. The container remains non-root with persistent `/data`, health/readiness checks and no mandatory hosted service.

All paths must preserve the existing zero-provider-bill option.

## npm publication boundary

npm publication is optional for Phase 10 acceptance.

If enabled:

1. only the three public packages may publish;
2. publication uses the exact release version;
3. publication occurs after all release validation checks;
4. `--provenance` or equivalent trusted-publishing provenance should be used when supported by the chosen npm trusted-publishing configuration;
5. the workflow must not store npm tokens in repository files, generated artifacts or audit logs;
6. a publication failure must not mutate the already-generated package contents;
7. publication status is recorded in release notes/manifest metadata only after successful publication.

If trusted publishing is not configured, GitHub prerelease commissioning remains valid and the npm lane stays disabled.

## Public-alpha documentation

Phase 10 adds or completes the following public documentation surfaces:

- `CHANGELOG.md` with the first alpha entry;
- public-alpha quick start;
- installation guide for source, tarball and Docker paths;
- sample mission path using repository examples;
- browser setup guidance that does not imply bundled browser binaries;
- desktop bridge guidance that distinguishes portable contract support from backend-specific implementation availability;
- health/readiness checks;
- security reporting path;
- upgrade and rollback guidance;
- known limitations;
- release notes template/content;
- release artifact verification instructions.

Documentation must preserve the distinction between tested, experimental and future functionality. The full multi-backend compatibility taxonomy remains Phase 11 work.

## Known limitations that must remain explicit

The public alpha documentation must disclose at least these current boundaries:

1. local CLI actor identifiers are not cryptographically authenticated;
2. the local audit hash chain is tamper-evident for retained records but is not an externally anchored transparency log;
3. browser binaries are not bundled;
4. native desktop automation backends remain optional bridge implementations rather than universally bundled platform drivers;
5. provider endpoints and credentials are user-supplied and provider-neutral;
6. the supported baseline is a single-node runtime; distributed/team infrastructure remains future work;
7. the alpha may contain breaking changes before stable release;
8. package registry publication may be unavailable even when GitHub release tarballs are available.

## Upgrade and rollback model

For the first alpha, upgrades remain conservative and state-first.

Before upgrading, operators back up `Q1X_HOME`/the SQLite state directory. After upgrade they run audit verification, runtime status and readiness checks before resuming work.

Rollback means restoring the prior executable/package/image plus the corresponding backed-up runtime state when a schema/state migration has changed durable state. Phase 10 must not promise forward/backward state compatibility beyond what is explicitly tested.

No automatic destructive migration framework is introduced merely for the first alpha.

## Security and supply-chain boundaries

The commissioning workflow must:

- use full-SHA-pinned GitHub Actions, following the existing repository convention;
- use least-required workflow permissions;
- not expose provider/API credentials;
- not require paid signing or hosting services;
- not publish private Q1X material;
- treat generated package artifacts as immutable inputs to release publication;
- verify package contents before release;
- retain PolyForm Noncommercial License 1.0.0 as the default public repository licence.

Release workflow permissions that can create tags/releases or publish packages must be isolated from ordinary validation jobs.

## GitHub Pages and public project surface

Existing `docs/` remains the authoritative public documentation source for the GitHub Pages site. Phase 10 updates documentation in-repository and verifies internal links/content structure where practical.

Phase 10 may verify the public Pages URL after merge/release, but it must not introduce a mandatory paid hosting service or separate public website architecture.

## Release ownership and fail-closed behavior

A release is not considered commissioned merely because a tag or release object exists.

Commissioning requires the release object, source SHA, versioned packages, release manifest, checksums and CI evidence to agree. Any mismatch is a commissioning failure and must be corrected with a new candidate rather than hidden by editing generated artifacts in place.

The authoritative tag and release artifacts must be created by the governed release-mode workflow from protected `main`; feature-branch builds may validate but cannot become authoritative releases.

## Phase boundary

Phase 10 owns public-alpha commissioning only.

It explicitly does not deliver:

- the comprehensive provider/model/backend compatibility matrix;
- formal tested/experimental/unsupported declarations for every adapter/backend;
- the Community Adapter SDK/template and adapter release governance;
- stable/GA release guarantees.

Those remain Phase 11 or later work.

## Acceptance criteria

Phase 10 is complete only when:

1. the commissioning workflow exists and passes validation on protected `main`;
2. package alignment and external-consumer tarball installation tests pass;
3. release manifest/checksum generation and verification pass;
4. source, packed-package and Docker installation paths are documented and verified;
5. public-alpha quick start, changelog, known limitations, security and upgrade/rollback guidance are published in-repository;
6. all existing Repository Baseline, Runtime and Contracts, CodeQL and cross-platform packaging gates remain green;
7. Community/public boundary and PolyForm Noncommercial licensing checks remain green;
8. the governed release mode can create the `v0.1.0-alpha.1` tag and matching GitHub prerelease only after validating the exact accepted `main` commit;
9. any npm publication remains explicit, optional and fail-closed;
10. the final release status remains `public-alpha`, not production-ready or GA.

## Public/private boundary

Only generic Community release automation, public package metadata, documentation, checksums and compatibility evidence belong in this repository.

No private Q1X control-plane implementation, enterprise deployment authority, proprietary release credentials, commercial policy corpus, private prompts, internal infrastructure topology or confidential operational material may be introduced as part of Phase 10.
