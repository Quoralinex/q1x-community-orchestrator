# Phase 4 Provider-Neutral Model Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, provider-neutral local/hosted model endpoint contracts, transports and CLI invocation.

**Architecture:** Persist credential-reference-only endpoint profiles in the existing runtime; normalize model requests/responses; route by open protocol id through a pluggable in-memory transport registry; ship three protocol-compatible transports tested only against loopback servers.

**Tech Stack:** Node.js 24+, TypeScript 7, JSON Schema 2020-12, built-in fetch/AbortSignal, SQLite runtime.

**Spec:** `docs/superpowers/specs/2026-09-06-model-transport-design.md`

## Global Constraints

- No provider, paid API or gateway is mandatory.
- Protocol ids are extensible strings; core has no provider switch statement.
- Secret values are environment-resolved only and never persisted/logged/returned.
- Remote plain HTTP is rejected; loopback HTTP is allowed.
- Prompt/output content is not persisted by transport invocation.
- Network tests use loopback emulators only.

---### Task 1: Model endpoint/request/response contracts

**Files:**
- Create: `packages/contracts/schemas/v1/model-endpoint.schema.json`, `model-request.schema.json`, `model-response.schema.json`
- Modify: `packages/contracts/src/index.ts`, `packages/sdk-typescript/src/*`, `packages/runtime/src/schema-loader.ts`
- Test: schema/type/distribution tests

**Interfaces:**
- Produces `ModelEndpoint`, `ModelRequest`, `ModelResponse`, `MODEL_PROTOCOLS`, and three new `SCHEMA_IDS`.

- [ ] Write RED catalog/schema/consumer-type tests.
- [ ] Add normative schemas and matching TypeScript reference types.
- [ ] Export built-in protocol ids while allowing arbitrary external protocol strings.
- [ ] Add schemas to runtime loader; rerun unchanged tests and commit `feat: add model transport contracts`.

### Task 2: Endpoint persistence and transport security

**Files:**
- Create: `packages/runtime/src/model-security.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Test: `tests/runtime-model-endpoint.test.mjs`

**Interfaces:**
- Produces endpoint CRUD plus `assertSafeEndpointUrl()` and credential-header resolution.

- [ ] Write RED tests for restart persistence, validation, HTTPS/loopback HTTP rules and missing environment credentials.
- [ ] Implement endpoint persistence in the global registry scope.
- [ ] Resolve credential headers at invocation only; never mutate/persist the endpoint with secret values.
- [ ] Commit `feat: add secure model endpoint registry`.### Task 3: Pluggable transport registry

**Files:**
- Create: `packages/runtime/src/model-transport.ts`
- Test: `tests/runtime-model-transport-registry.test.mjs`

**Interfaces:**
- Produces `ModelTransport`, `ModelTransportContext`, and `ModelTransportRegistry` with `register`, `get`, and `invoke`.

- [ ] Write RED tests proving external protocol registration/invocation and duplicate-protocol rejection.
- [ ] Implement registry with built-ins optional at construction.
- [ ] Keep request/response normalization at the transport boundary.
- [ ] Commit `feat: add pluggable model transport registry`.

### Task 4: Built-in wire-protocol transports

**Files:**
- Create: `packages/runtime/src/model-protocols.ts`
- Test: `tests/runtime-model-protocols.test.mjs`

**Interfaces:**
- Produces transports for `openai-chat-completions`, `openai-responses`, and `anthropic-messages`.

- [ ] Write RED loopback-server tests that inspect request bodies/headers and return representative protocol responses.
- [ ] Implement mappings, normalized text/usage parsing, bounded fetch, manual redirects and sanitized non-2xx errors.
- [ ] Verify credential headers are sent but never appear in response/error/audit objects.
- [ ] Commit `feat: add compatible model protocol transports`.### Task 5: Runtime invocation and CLI

**Files:**
- Modify: `packages/runtime/src/runtime.ts`, `packages/runtime/src/cli.ts`, `packages/runtime/src/index.ts`
- Test: `tests/runtime-model-invoke.test.mjs`, `tests/runtime-model-cli.test.mjs`

**Interfaces:**
- Produces `registerModelTransport()`, `invokeModel()`, `endpoints put/list/get`, and `model invoke --file`.

- [ ] Write RED runtime and subprocess CLI tests against loopback endpoints.
- [ ] Initialize the default transport registry in each runtime instance and permit external registration.
- [ ] Validate model request and normalized response; audit only endpoint/protocol/status/duration.
- [ ] Add CLI endpoint persistence and model invocation while preserving every existing command.
- [ ] Commit `feat: expose model transport runtime and cli`.

### Task 6: Local-first examples, docs and release gate

**Files:**
- Create: `examples/model-endpoints/*`, `docs/model-transport.md`
- Modify: README/Pages/runtime README/roadmap/tests as needed

- [ ] Add schema-validated loopback examples for all three built-in protocols and a credential-reference hosted example with no secret value.
- [ ] Document local-first usage, protocol/provider distinction, credential rules and external transport extension.
- [ ] Run clean install/full tests/audit/package dry-runs/private-tool leak scan/action-pin check/diff check.
- [ ] Push PR, wait for required GitHub checks, squash merge, verify merged `main`, then continue to Phase 5.