<p align="center">
  <img src="docs/assets/brand/q1x-logo-transparent.png" alt="Q1X" width="180">
</p>

# Q1X Community Orchestrator

Q1X Community Orchestrator is a provider-neutral, OS-neutral orchestration runtime for turning broad goals into governed, long-horizon programmes of work across AI models, agents, tools, software and digital services.

> **Status:** Pre-alpha foundation. The repository is being built in governed delivery phases. Do not treat the current repository as production-ready.

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

The provider-neutral `v1` contract family lives under [`packages/contracts/schemas/v1/`](packages/contracts/schemas/v1/). JSON Schema 2020-12 is normative; [`packages/sdk-typescript/`](packages/sdk-typescript/) is the first reference SDK. Validated examples cover company formation, digital R&D, software delivery, capability discovery and model transport.

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

## Capability fabric

Implemented foundations now cover durable orchestration state, capability discovery, provider-neutral model transport and MCP/A2A/CLI execution. The next adapter families are browser/web control and desktop/application control, followed by software/simulation adapters and edge/device bridges.

## Deployment profiles

The initial target is a zero-cost personal profile using an embedded database and local storage. Team and distributed profiles will add PostgreSQL, S3-compatible object storage, multiple workers and optional cloud infrastructure without changing the orchestration contracts.

## Documentation

The detailed architecture, use cases, deployment model, governance and delivery roadmap live in the project documentation and GitHub Pages site under [`docs/`](docs/).

## Contributing

Contributions are welcome through pull requests. `main` is protected. Read [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) and the contribution licensing requirements before proposing changes.

## Licence

Use is free under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial purposes. Commercial use, distribution as part of a commercial product or service, or other commercial exploitation requires a separate commercial licence from Quoralinex. See [`LICENSE`](LICENSE) and [`COMMERCIAL-LICENSING.md`](COMMERCIAL-LICENSING.md).
