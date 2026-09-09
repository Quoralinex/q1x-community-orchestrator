# Q1X Community Orchestrator public alpha

Q1X Community Orchestrator remains experimental software intended for evaluation, local development and Community testing. The commissioned `v0.1.0-alpha.1` release is immutable. This document describes the separately governed Phase 12 `v0.1.0-alpha.2` candidate and its commissioning path; it is not production-ready or generally available.

The Community baseline remains standalone and can operate locally without a hosted Q1X service, cloud account or paid model API. External model/MCP/A2A services and their credentials remain operator-selected. Phase 12 itself ships the first-party macOS, Windows and Linux desktop bridge packages; a compatible browser binary is still supplied by the operator.

## Release identity and verification

The governed GitHub prerelease is identified by:

- version `0.1.0-alpha.2`;
- tag `v0.1.0-alpha.2`;
- the exact protected `main` source commit recorded in `release-manifest.json`;
- eight package tarballs for contracts, core SDK, Adapter SDK, desktop bridge common, first-party macOS/Windows/Linux desktop bridges and runtime;
- `SHA256SUMS` containing the SHA-256 digest of every package tarball.

After downloading the release bundle, verify package integrity before installation:

```bash
sha256sum --check SHA256SUMS
```

On macOS, where `shasum` is commonly available instead:

```bash
shasum -a 256 -c SHA256SUMS
```

Then inspect `release-manifest.json` and confirm its version, tag and source SHA match the GitHub prerelease you intend to use.

## Source installation

Prerequisites:

- Node.js 24 or later;
- npm compatible with the repository lockfile;
- Git when cloning the repository.

From the tagged source:

```bash
git clone https://github.com/Quoralinex/q1x-community-orchestrator.git
cd q1x-community-orchestrator
git checkout v0.1.0-alpha.2
npm ci --no-audit --no-fund
npm run build
node packages/runtime/dist/cli.js --home ./.q1x init
node packages/runtime/dist/cli.js --home ./.q1x status
```

The root workspace is deliberately private/non-publishable. The governed Phase 12 release set contains exactly eight public packages: contracts, TypeScript core SDK, Community Adapter SDK, desktop bridge common, macOS bridge, Windows bridge, Linux bridge and runtime.

## Packed package installation

The GitHub prerelease package tarballs remain a supported alpha installation path even if the Q1X packages have not been published to npm.

Download these eight files from the same governed release:

- `quoralinex-q1x-community-contracts-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-sdk-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-adapter-sdk-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-desktop-bridge-common-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-desktop-bridge-macos-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-desktop-bridge-windows-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-desktop-bridge-linux-0.1.0-alpha.2.tgz`;
- `quoralinex-q1x-community-runtime-0.1.0-alpha.2.tgz`.

After verifying `SHA256SUMS`, install them together into a project:

```bash
npm install \
  ./quoralinex-q1x-community-contracts-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-sdk-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-adapter-sdk-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-desktop-bridge-common-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-desktop-bridge-macos-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-desktop-bridge-windows-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-desktop-bridge-linux-0.1.0-alpha.2.tgz \
  ./quoralinex-q1x-community-runtime-0.1.0-alpha.2.tgz
```

The runtime's public third-party dependencies are resolved by npm in the normal way. Q1X provider credentials are not required merely to initialise the runtime.

Then run:

```bash
npx q1x --home ./.q1x init
npx q1x --home ./.q1x status
```

The commissioning workflow independently verifies the same eight Q1X tarballs in a clean external consumer with Q1X package registry access disabled, so workspace links cannot hide missing Q1X package contents. The verifier supplies already-installed third-party dependency directories locally for that CI check; a normal user installation still resolves third-party packages through npm.

## Community Adapter SDK

The public `@quoralinex/q1x-community-adapter-sdk` package is part of the governed alpha package set. Its compatibility line is SDK `0.1.0-alpha.2`, contract `1.0.0`, runtime `0.1.x`.

Community adapters are installed and registered explicitly by the operator. The SDK provides validation and `runAdapterConformance(...)`; the runtime provides the narrow `communityAdapterTransport(...)` bridge. The SDK is **not a sandbox**, and passing conformance does not establish trust or replace source/dependency/security review.

See [Community Adapter SDK](community-adapter-sdk.md), the local `examples/community-adapter/` reference and the evidence-driven [Compatibility Matrix](compatibility-matrix.md).

## Docker installation

Build from the tagged source:

```bash
docker build --pull -t q1x-community-orchestrator:0.1.0-alpha.2 .
```

Run with persistent state:

```bash
docker volume create q1x-state

docker run --rm \
  --name q1x-community \
  -p 127.0.0.1:8787:8787 \
  -v q1x-state:/data \
  q1x-community-orchestrator:0.1.0-alpha.2
```

Or use the hardened local Compose profile:

```bash
docker compose up --build
```

The container runs as a non-root user, stores persistent state under `/data`, and does not expose a mandatory hosted orchestration API.

## Health and readiness

For a direct local service:

```bash
Q1X_HOME=./.q1x Q1X_HOST=127.0.0.1 Q1X_PORT=8787 npm start
```

Check:

```bash
curl -fsS http://127.0.0.1:8787/healthz
curl -fsS http://127.0.0.1:8787/readyz
```

`/healthz` reports process health. `/readyz` reports runtime/database readiness. Before becoming ready, the service verifies the security audit chain and reconciles interrupted running assignments. Audit corruption is fail-closed.

These endpoints do not provide orchestration, model, browser or desktop execution APIs.

## Sample mission

The repository includes validated examples. From a source checkout:

```bash
node packages/runtime/dist/cli.js --home ./.q1x init
node packages/runtime/dist/cli.js --home ./.q1x mission put --file examples/company-launch/mission.json
node packages/runtime/dist/cli.js --home ./.q1x mission list
```

When using the packed runtime, replace `node packages/runtime/dist/cli.js` with `npx q1x` while keeping the same `--home` and command arguments.

## Browser setup

Q1X does not bundle browser binaries. Browser control requires an explicitly configured compatible browser endpoint. The built-in browser layer supports managed Chromium-family execution and explicit CDP attachment subject to the runtime's navigation/origin and file policies.

See [Browser and web control](browser-control.md) for endpoint configuration and the exact security boundaries. Do not infer support for a browser or operating-system combination that has not been tested in the compatibility matrix.

## Desktop/application setup

The Phase 12 package set ships first-party macOS Accessibility, Windows UI Automation and Linux AT-SPI bridge packages behind the provider-neutral stdio-bridge boundary. macOS Accessibility permission, Windows protected/elevated process boundaries and Linux AT-SPI/graphical-session prerequisites remain host constraints; application-specific controllers remain optional extensions.

See [Desktop and application control](desktop-control.md) and [Compatibility Matrix](compatibility-matrix.md).

## Security and audit checks

Before resuming consequential work after install, restore or upgrade, run:

```bash
npx q1x --home ./.q1x audit verify
npx q1x --home ./.q1x recovery reconcile
npx q1x --home ./.q1x status
```

When running from source, use `node packages/runtime/dist/cli.js` instead of `npx q1x`.

Security reports should follow [SECURITY.md](../SECURITY.md). Current security boundaries and nonclaims are documented in [Security, approvals, evidence, audit and recovery](security-hardening.md) and [Known limitations](known-limitations.md).

## Upgrade

Treat runtime state as the primary asset during alpha upgrades.

1. Stop the runtime cleanly.
2. Back up the complete `Q1X_HOME`, including SQLite WAL/SHM files when present, or use a SQLite-aware consistent backup.
3. Verify the new release manifest and `SHA256SUMS`.
4. Replace the source checkout, package installation or Docker image.
5. Start against the intended runtime home.
6. Run `q1x audit verify`.
7. Run `q1x recovery reconcile` if interrupted assignments may exist.
8. Verify `q1x status` or `/readyz` before resuming work.

The alpha does not promise compatibility across a future destructive state-schema migration unless that release explicitly documents and tests it.

## Rollback

If an alpha upgrade must be reversed:

1. stop the new runtime;
2. restore the previous executable/package/image;
3. if the newer release changed durable state or migrations, restore the corresponding pre-upgrade `Q1X_HOME` backup as one consistency unit;
4. run audit verification and readiness/status checks before resuming work.

Do not mix an older executable with durable state that a newer incompatible migration has transformed unless that downgrade path is explicitly supported by the release.

## What is tested

Commissioning verifies the source-install lifecycle on GitHub-hosted Ubuntu, macOS and Windows runners, plus the Linux OCI/Docker path. It verifies all eight generated package tarballs as an external consumer, checks their SHA-256 release evidence, exercises the connector catalogue and doctor, and runs each first-party desktop bridge doctor.

Phase 12 also exercises no-custom-code model, MCP, A2A, CLI and managed-browser flows. Linux desktop evidence includes a virtual X11/AT-SPI accessibility session; macOS and Windows evidence includes deterministic native-bridge harnesses and host doctor output. Those results do not imply universal physical-host/application compatibility. See [Product usability](product-usability.md) and the evidence-driven [Compatibility Matrix](compatibility-matrix.md).
