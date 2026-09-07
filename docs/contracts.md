---
layout: default
title: Contracts
---

# Public contracts

The `v1` contract layer is the stable public language used to describe missions, programmes, work, capabilities and execution without binding the orchestrator to a particular AI provider, operating system or deployment platform.

**JSON Schema 2020-12 is normative.** The TypeScript SDK is a reference convenience layer and must follow the schemas rather than redefine them.

## Contract families

| Contract | Purpose |
| --- | --- |
| Mission | User objective, outcomes, constraints and lifecycle |
| Programme | Workstreams, assumptions and programme revision |
| Work graph | Executable work nodes and dependency relationships |
| Replan event | Evidence-driven or condition-driven programme change |
| Capability | Discoverable operations, modality, cost, privacy, trust and availability |
| Adapter manifest | How a capability family can be reached |
| Execution request/result | Provider-neutral worker invocation and result envelopes |
| Evidence / artifact | Durable proof and produced outputs |
| Approval | Human, agent or service decision gates |
| Checkpoint | Resumable programme state references |
| Deployment profile | Personal, team or distributed runtime requirements |
| Discovery manifest | OS-neutral command, path, environment and HTTP probes that produce live capabilities |
| Model endpoint | Persistable local/hosted endpoint configuration with credential references, never credential values |
| Model request / response | Provider-neutral text model invocation and normalized output envelopes |

## Adapter kinds

The initial registry supports native APIs, generic provider HTTP, OpenAI-compatible and Anthropic-compatible wire protocols, local inference, MCP, A2A, CLI/TUI, browser control, desktop control, software runtimes and edge/device bridges.

Protocol compatibility names describe wire formats only. They do not make any provider mandatory.

## Versioning

Current contract version: `1.0.0` under `packages/contracts/schemas/v1/`.

Backward-compatible additions may remain within a major contract version. Breaking contract changes require a new major version so runtimes and adapters can negotiate compatibility explicitly.

## Examples and validation

The repository includes validated examples for company launch, digital R&D, software delivery, capability discovery and model transport. Run:

```bash
npm ci
npm run check
```

The validation suite checks schema validity, positive examples, deliberate invalid cases, strict TypeScript compilation and alignment between the schema adapter catalog and the reference package constants.
