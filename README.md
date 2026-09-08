<p align="center">
  <img src="docs/assets/brand/q1x-logo-transparent.png" alt="Q1X" width="180">
</p>

# Q1X Community Orchestrator

Q1X Community Orchestrator is a provider-neutral, OS-neutral orchestration runtime for turning broad goals into governed, long-horizon programmes of work across AI models, agents, tools, software and digital services.

> **Status:** Public-alpha commissioning candidate. The repository is still experimental and must not be treated as production-ready. Phase 10 is not accepted until the exact release-candidate head passes all required CI/security/release gates and is merged to protected `main`.

## What it is

The project is designed to orchestrate outcomes rather than a single model, coding assistant or repository. A mission can be decomposed into outcomes, workstreams, work packages, tasks, experiments, evidence and artifacts, then dynamically replanned as new evidence appears.

Example domains include company formation, research programmes, digital R&D, product development, software delivery, infrastructure, documentation, marketing, operations, analysis and other multi-stage digital work.

## Core principles

- Provider-neutral: no mandatory OpenAI, Anthropic, Google or other model provider.
- Local-first capable: local inference can be the zero-provider-bill baseline.
- OS-neutral: macOS, Windows and Linux are first-class targets.
- Capability-based routing: models are capabilities alongside MCP tools, A2A agents, CLIs, browsers, desktop applications, software runtimes and future devices.
- Deployable: single-node Docker/local operation first, with optional distributed and cloud deployment profiles.
- Adaptive: plans can be revised, cancelled, branched and resumed when evidence changes.
- Governed: approvals, policy, audit, artifacts and evidence are part of execution, not afterthoughts.

## Phase 1: public contract layer

The provider-neutral `v1` contract family lives under [`packages/contracts/schemas/v1/`](packages/contracts/schemas/v1/). JSON Schema 2020-12 is normative; [`packages/sdk-typescript/`](packages/sdk-typescript/) is the first reference SDK. Validated examples cover company formation, digital R&D, software delivery, capability discovery, model transport, executable adapters, browser control, desktop/application control and adaptive supervision.

```bash
npm ci
npm run check
```

See [`docs/contracts.md`](docs/contracts.md) for the contract catalog and versioning rules.

## Phase 2: Open Control Runtime

The executable runtime under [`packages/runtime/`](packages/runtime/) uses Node.js 24+ built-in SQLite for missions, programmes, work graphs, execution lifecycle records and transactional checkpoints without requiring a hosted database or model provider.

```bash
node packages/runtime/dist/cli.js --home ./q1x-state init
node packages/runtime/dist/cli.js --home ./q1x-state mission put --file examples/company-launch/mission.json
```

See [`docs/runtime.md`](docs/runtime.md).

## Phase 3: capability discovery and live registry

Provider-neutral discovery manifests use command, filesystem path, environment-key and HTTP probes. Results persist in the local capability registry; vendor-specific detection belongs in optional manifests/plugins rather than Community core.

```bash
node packages/runtime/dist/cli.js --home .q1x discover --manifest examples/discovery
node packages/runtime/dist/cli.js --home .q1x capabilities list
```

See [`docs/discovery.md`](docs/discovery.md).

## Phase 4: provider-neutral model transport

The runtime can now persist safe model endpoints and invoke local or hosted inference through pluggable wire-protocol transports. Built-ins cover OpenAI-compatible chat completions, Responses-compatible endpoints and Anthropic-compatible Messages endpoints; those are protocol formats, not mandatory providers.

```bash
node packages/runtime/dist/cli.js --home .q1x endpoints put --file examples/model-endpoints/local-openai-chat.endpoint.json
node packages/runtime/dist/cli.js --home .q1x model invoke --file examples/model-endpoints/example.model-request.json
```

Local loopback HTTP is supported for zero-provider-bill inference. Remote endpoints require HTTPS. Credential values are resolved from environment variables at invocation time and are never persisted. See [`docs/model-transport.md`](docs/model-transport.md).

## Phase 5: MCP, A2A and CLI/TUI adapters

The runtime now persists executable adapter endpoints and dispatches MCP, A2A and local CLI/TUI work through one provider-neutral adapter registry. MCP uses the official TypeScript client for stdio and Streamable HTTP; A2A supports Agent Card discovery and JSON-RPC `message/send`; CLI tools are spawned directly without a shell.

```bash
node packages/runtime/dist/cli.js --home .q1x adapter-endpoints put --file examples/adapter-endpoints/mcp-stdio.endpoint.json
node packages/runtime/dist/cli.js --home .q1x adapter discover adapter.mcp.local-files
```

See [`docs/agent-cli-adapters.md`](docs/agent-cli-adapters.md).

## Phase 6A: browser and web control

The runtime controls real browser sessions through a provider-neutral browser endpoint/action layer. The built-in Playwright backend supports managed browser contexts and explicit CDP attachment to an existing Chromium-family session, with navigation/origin policy, mouse and keyboard control, forms, inspection/extraction, bounded uploads/downloads and screenshots.

```bash
node packages/runtime/dist/cli.js --home .q1x browser-endpoints put --file examples/browser-endpoints/managed-chromium.endpoint.json
node packages/runtime/dist/cli.js --home .q1x browser run browser.managed-chromium --file examples/browser-endpoints/example.browser-batch.json
```

Q1X does not bundle browser binaries or persist cookies/session material. See [`docs/browser-control.md`](docs/browser-control.md).

## Phase 6B: desktop and application control

The runtime now controls native desktop applications through provider-neutral `DesktopEndpoint` and `DesktopActionBatch` contracts. The built-in `stdio-bridge` backend launches an explicitly configured bridge with separate command/argv and no shell, enforces application/platform policy, bounds output and keeps UI content out of runtime audit events.

```bash
node packages/runtime/dist/cli.js --home .q1x desktop-endpoints put --file examples/desktop-endpoints/portable-stdio.endpoint.json
node packages/runtime/dist/cli.js --home .q1x desktop discover desktop.portable-stdio
```

Native macOS Accessibility, Windows UI Automation, Linux AT-SPI and application-specific controllers remain optional bridge implementations behind the same Q1X backend interface. See [`docs/desktop-control.md`](docs/desktop-control.md).

## Phase 7: dynamic teams and adaptive programme supervision

The runtime can now bind discovered capabilities to executable endpoints, form logical specialist teams for ready work, persist assignment attempts, supervise dependency-aware cycles and stop or replan at explicit approval, budget, deadline, failure and convergence boundaries.

```bash
node packages/runtime/dist/cli.js --home .q1x bindings put --file examples/supervision/example.execution-binding.json
node packages/runtime/dist/cli.js --home .q1x team form programme.example --policy examples/supervision/example.supervision-policy.json
```

Supervision remains provider-neutral and uses the existing model, adapter, browser and desktop execution boundaries. Programme proposals are validated before acceptance and existing programmes are checkpointed before adaptive revisions by default. See [`docs/supervision.md`](docs/supervision.md).

## Phase 8: cross-platform packaging and Docker deployment

The pre-alpha runtime now has a verified source-install path for macOS, Windows and Linux plus a reproducible non-root Docker image with persistent `/data`, explicit environment configuration and health/readiness checks. A hardened local Compose profile is also included.

```bash
npm ci --no-audit --no-fund
npm run build
node packages/runtime/dist/cli.js --home .q1x init
```

```bash
docker compose up --build
```

The container exposes only health/readiness on port `8787`; it does not create a mandatory hosted orchestration API. The Cross-platform Packaging workflow verifies native installation across all three operating systems and Docker build, non-root execution and persistent restart on Linux. See [`docs/deployment.md`](docs/deployment.md).

## Phase 9: security, approvals, evidence, audit and recovery hardening

The runtime now includes single-use fail-closed approvals for protected work, immutable evidence provenance, metadata-only SHA-256-linked audit receipts and checkpoint-backed restart reconciliation. The local service verifies the audit chain and reconciles abandoned running assignments before entering ready state.

```bash
node packages/runtime/dist/cli.js --home .q1x approval request --file examples/security/example.approval-request.json
node packages/runtime/dist/cli.js --home .q1x audit verify
node packages/runtime/dist/cli.js --home .q1x recovery reconcile
```

Audit metadata recursively redacts secret-shaped keys and does not copy prompts, browser/desktop session content or credentials into routine receipts. The current local CLI does not cryptographically authenticate actor identifiers, and the local hash chain is not an externally anchored transparency log. See [`docs/security-hardening.md`](docs/security-hardening.md) for the exact behavior and limitations.

## Phase 10: public alpha commissioning candidate

The first governed public-alpha candidate is version `0.1.0-alpha.1`, tag `v0.1.0-alpha.1`. Phase 10 adds release identity checks, exact internal package version locking, generated contracts/SDK/runtime tarballs, SHA-256 release evidence, clean external-consumer verification and a dedicated fail-closed Public Alpha Commissioning workflow.

The GitHub prerelease is designed to be authoritative even when npm publication is unavailable. npm publication is a separate opt-in Trusted Publishing/OIDC lane and is never required for the GitHub release path.

See [`docs/public-alpha.md`](docs/public-alpha.md), [`docs/known-limitations.md`](docs/known-limitations.md), [`CHANGELOG.md`](CHANGELOG.md) and [`RELEASE_NOTES.md`](RELEASE_NOTES.md). Phase 11 remains separate and will deliver the broader compatibility matrix and Community Adapter SDK.

## Capability fabric

Implemented foundations cover durable orchestration state, capability discovery, provider-neutral model transport, MCP/A2A/CLI execution, browser/web control, desktop/application control, dynamic team formation, adaptive programme supervision, cross-platform local/container packaging and security/approval/evidence/audit/recovery hardening. Public-alpha commissioning is the current delivery phase; broad compatibility declarations and the Community Adapter SDK remain Phase 11 work.

## Deployment profiles

The supported alpha baseline is a zero-cost single-node profile using an embedded database and local storage, available through direct Node installation or Docker. Team and distributed profiles may later add PostgreSQL, S3-compatible object storage, multiple workers and optional cloud infrastructure without changing the orchestration contracts.

## Documentation

The detailed architecture, use cases, deployment model, public-alpha guidance, governance and delivery roadmap live in the project documentation and GitHub Pages site under [`docs/`](docs/).

## Contributing

Contributions are welcome through pull requests. `main` is protected. Read [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) and the contribution licensing requirements before proposing changes.

## Licence

Use is free under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial purposes. Commercial use, distribution as part of a commercial product or service, or other commercial exploitation requires a separate commercial licence from Quoralinex. See [`LICENSE`](LICENSE) and [`COMMERCIAL-LICENSING.md`](COMMERCIAL-LICENSING.md).
