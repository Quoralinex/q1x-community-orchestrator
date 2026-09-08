---
layout: default
title: Home
---

<section class="hero">
<p class="eyebrow">Universal orchestration for long-horizon work</p>

<h1>Q1X Community Orchestrator</h1>

<p class="lede">Turn broad goals into governed programmes of work across AI models, agents, tools, applications and digital services—without binding users to one vendor, operating system or deployment provider.</p>
</section>

<div class="grid">
  <article class="card"><h3>Mission-led</h3><p>Start with an outcome. Build workstreams, dependencies, experiments, evidence and deliverables dynamically.</p></article>
  <article class="card"><h3>Capability-routed</h3><p>Use cloud or local models, MCP, A2A, CLI/TUI, browser control, desktop applications, software runtimes and future devices.</p></article>
  <article class="card"><h3>Local-first capable</h3><p>Run without a mandatory paid model API, then scale from one machine to distributed or cloud deployments.</p></article>
</div>

## The idea

A user describes an outcome. The orchestrator constructs a programme, decomposes it into executable work, discovers available capabilities, assembles dynamic teams, supervises dependencies and evidence, and safely replans when conditions change.

Software delivery is only one workload. The project is designed for research, company creation, digital R&D, infrastructure, documentation, product development, operations, analysis and other multi-stage digital missions.

<div class="callout"><strong>Design rule:</strong> models are capabilities, not the architecture. The system routes work by capability, cost, privacy, modality, evidence, trust and availability.</div>

## Public alpha

Phase 10 implements the governed `0.1.0-alpha.1` public-alpha release pipeline. The release surface includes version-locked package tarballs, SHA-256 integrity evidence, clean external-consumer verification, cross-platform source installation and a fail-closed GitHub prerelease workflow. The software remains experimental and is not production-ready. The authoritative prerelease is created only from a verified protected `main` commit.

- [Public alpha quick start](public-alpha.md) — release identity, installation, integrity verification, upgrade and rollback.
- [Known limitations](known-limitations.md) — explicit alpha nonclaims and unsupported assumptions.

## Explore the project

- [Architecture](architecture.md) — mission engine, programme graph, control runtime and capability fabric.
- [Contracts](contracts.md) — normative schemas, adapter taxonomy and versioning rules.
- [Capability discovery](discovery.md) — manifest-driven probes and the live registry.
- [Model transport](model-transport.md) — local/hosted endpoint protocols, credentials and CLI invocation.
- [MCP, A2A and CLI/TUI adapters](agent-cli-adapters.md) — executable adapter endpoints, discovery, execution and security boundaries.
- [Browser and web control](browser-control.md) — real browser sessions, web-chat control, security boundaries and CLI usage.
- [Desktop and application control](desktop-control.md) — OS-neutral desktop actions, bridge backends, application policy and CLI usage.
- [Dynamic teams and programme supervision](supervision.md) — capability routing, durable assignments, supervision cycles, budgets, approvals and replanning.
- [Security, audit and recovery](security-hardening.md) — single-use approvals, immutable evidence, tamper-evident audit metadata, restart reconciliation and security limits.
- [Open Control Runtime](runtime.md) — SQLite state, semantic validation, CLI commands and checkpoint recovery.
- [Use cases](use-cases.md) — business, research, R&D, product, infrastructure and software examples.
- [Deployment model](deployment.md) — zero-cost personal, team and distributed profiles.
- [Review and governance](review-model.md) — CI, primary review, independent review and merge gates.
- [Delivery roadmap](roadmap.md) — staged implementation from foundation to stable community release.
- [Licensing](licensing.md) — free non-commercial use and commercial licensing.
