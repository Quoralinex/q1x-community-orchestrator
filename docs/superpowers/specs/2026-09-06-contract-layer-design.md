# Phase 1 Contract Layer Design

**Date:** 2026-09-06
**Status:** Approved architecture translated to repository specification

## Purpose

Phase 1 establishes the public, provider-neutral contracts that every later Q1X Community Orchestrator runtime, adapter, SDK, deployment and community extension can implement without depending on a specific AI vendor, operating system, cloud provider or Quoralinex-private control system.

The normative interface is versioned JSON Schema. TypeScript is the first reference SDK only; it is not the protocol authority.

## Design principles

1. Missions and outcomes are the top-level user intent, not repositories or coding tasks.
2. Programmes decompose missions into workstreams and a versioned work graph.
3. Capabilities describe what can perform work; model brands are metadata, not architecture.
4. Adapters describe how capabilities are reached across APIs, local inference, MCP, A2A, CLI/TUI, browser control, desktop control, software runtimes and edge/device bridges.
5. Execution, evidence, artifacts, approvals and checkpoints use stable envelopes independent of the underlying worker.
6. Routing metadata covers cost, privacy, trust, modality, platform and availability without requiring a paid API.
7. The public contracts contain no Q1X private control-plane authority, company cells, internal review agents, canonical-workspace rules or proprietary memory/governance logic.
8. Contract evolution is explicit and versioned. Breaking changes require a new major contract version.

## Normative contracts

The first contract family is `v1` and uses JSON Schema 2020-12 with stable URN identifiers under `urn:q1x:community:contracts:v1:*`.

Schemas cover:

- common identifiers, timestamps, references, actors and routing-policy primitives;
- mission and measurable outcomes;
- programme and workstream structure;
- work graph nodes, dependencies and statuses;
- replanning events;
- capability descriptors and live availability;
- adapter manifests;
- execution requests, results and errors;
- evidence and artifacts;
- approval requests and decisions;
- checkpoints and resumability;
- deployment profiles for personal, team and distributed operation.

JSON Schema validates document structure. Semantic graph checks that require cross-document reasoning, such as ensuring every dependency points to a real node or proving a dependency graph is acyclic, belong in runtime validators rather than being misrepresented as schema guarantees.

## Adapter taxonomy

Initial adapter kinds are:

- `native-api`
- `provider-http`
- `openai-protocol`
- `anthropic-protocol`
- `local-inference`
- `mcp`
- `a2a`
- `cli-tui`
- `browser-control`
- `desktop-control`
- `software-runtime`
- `edge-device`

The compatibility protocol names do not privilege a provider. They describe wire compatibility only.

## Reference TypeScript SDK

`@quoralinex/q1x-community-contracts` packages the normative schemas and small shared constants. `@quoralinex/q1x-community-sdk` provides reference TypeScript interfaces and the minimal `CapabilityAdapter` contract.

The adapter interface exposes discovery and execution only in Phase 1. Provider-specific authentication, browser automation implementations, model routing and distributed scheduling are later phases.

## Examples

Examples deliberately cover different domains:

- company formation and launch;
- digital R&D using a low-noise civilian drone propulsion research mission as a programme example;
- software delivery as one additional workload rather than the project centre.

Examples must validate against the same public schemas shipped to users.

## Verification

Phase 1 is accepted when:

- all schemas are valid JSON Schema 2020-12 documents;
- positive examples validate;
- deliberate invalid fixtures are rejected;
- TypeScript packages compile with strict settings;
- adapter-kind constants and schema enums remain aligned;
- no public Phase 1 file depends on Quoralinex-private governance or a mandatory third-party CI/model provider;
- the repository baseline and Phase 1 GitHub Actions checks pass on the pull request.

## Non-goals

Phase 1 does not implement the orchestrator runtime, persistence engine, model gateway, browser controller, desktop controller, MCP/A2A transports, dynamic team engine, routing intelligence or physical-device execution. It defines the stable public language those later components use.
