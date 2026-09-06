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

## Planned capability fabric

The runtime is intended to support native provider APIs, generic HTTP model APIs, OpenAI- and Anthropic-compatible wire protocols, local inference servers, model gateways, MCP, A2A, CLI/TUI execution, browser and web control, desktop control, software/simulation adapters and edge/device bridges.

## Deployment profiles

The initial target is a zero-cost personal profile using an embedded database and local storage. Team and distributed profiles will add PostgreSQL, S3-compatible object storage, multiple workers and optional cloud infrastructure without changing the orchestration contracts.

## Documentation

The detailed architecture, use cases, deployment model, governance and delivery roadmap live in the project documentation and GitHub Pages site under [`docs/`](docs/).

## Contributing

Contributions are welcome through pull requests. `main` is protected. Read [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) and the contribution licensing requirements before proposing changes.

## Licence

Use is free under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial purposes. Commercial use, distribution as part of a commercial product or service, or other commercial exploitation requires a separate commercial licence from Quoralinex. See [`LICENSE`](LICENSE) and [`COMMERCIAL-LICENSING.md`](COMMERCIAL-LICENSING.md).
