# Phase 5 MCP, A2A and CLI/TUI Adapter Implementation Plan

**Goal:** Deliver neutral adapter endpoint contracts plus executable MCP, A2A and CLI/TUI transports over the existing orchestration runtime.

**Spec:** `docs/superpowers/specs/2026-09-07-agent-cli-adapters-design.md`

## Constraints

- No provider or paid service is mandatory.
- Reuse `ExecutionRequest` / `ExecutionResult`; do not invent a second work envelope.
- No shell execution; subprocess command/args remain distinct.
- Secret values are environment-resolved only.
- Remote HTTP requires HTTPS; loopback HTTP is allowed.
- Transport invocation must not persist request input or returned output.

### Task 1 — Adapter endpoint contract and SDK types

Create `adapter-endpoint.schema.json`, add schema catalog/export, and add TypeScript reference types.

- Write RED schema/type/distribution tests.
- Add transport variants for HTTP and stdio/process endpoints.
- Restrict endpoint adapter kinds to `mcp`, `a2a`, `cli-tui`.
- Add security-compatible credential/environment reference structures.
- Make unchanged tests GREEN and commit.
### Task 2 — Secure endpoint registry and unified transport registry

Add persisted adapter endpoints to `OpenControlRuntime` and a pluggable `AdapterTransportRegistry`.

- Write RED persistence/security/registry tests.
- Validate endpoint contracts and references.
- Enforce HTTPS/loopback HTTP and secret-reference rules.
- Permit external transport registration by protocol id.
- Commit endpoint and registry implementation.

### Task 3 — CLI/TUI transport

Implement direct subprocess execution with text and JSON stdin/stdout modes.

- Write RED portable child-process tests.
- Spawn with no shell and explicit argv.
- Map only configured environment keys; preserve minimal runtime path/home variables.
- Bound output and timeout execution.
- Normalize exit status/stdout/stderr to `ExecutionResult` without audit-content persistence.
- Commit CLI/TUI transport.

### Task 4 — A2A transport and Agent Card discovery

Implement A2A 0.3 JSON-RPC `message/send` plus public Agent Card capability discovery.

- Write RED loopback Agent Card / JSON-RPC tests.
- Normalize text/data task or message output.
- Map terminal/working/input-required task states conservatively.
- Register Agent Card skills as capability descriptors.
- Commit A2A transport.
### Task 5 — MCP client transport and capability discovery

Use the official MCP TypeScript client for current stdio and Streamable HTTP support.

- Add the official client dependency at a pinned compatible range.
- Write RED local MCP server tests for list-tools and tool-call execution.
- Implement stdio and Streamable HTTP endpoint creation.
- Convert advertised tools into capability descriptors.
- Normalize tool results to `ExecutionResult` and always close clients/transports.
- Commit MCP transport.

### Task 6 — Runtime execution and CLI surfaces

Expose adapter execution and discovery through the runtime and `q1x` CLI.

- Write RED runtime/CLI round-trip tests.
- Add `adapter-endpoints put/list/get`.
- Add `adapter execute <endpoint> --file <execution-request>`.
- Add `adapter discover <endpoint>` for MCP/A2A capability registration.
- Keep execution audit payloads metadata-only.
- Commit runtime/CLI integration.

### Task 7 — Examples, docs and protected merge

Add neutral examples and public documentation, then perform the complete repository gate.

- Validate all examples against normative contracts.
- Document MCP/A2A/CLI configuration, local-first use and security boundaries.
- Run clean install/full tests/audit/package dry-runs/boundary scan/action-pin/diff checks.
- Push PR, wait for required GitHub checks, squash merge and verify merged `main` plus Pages.