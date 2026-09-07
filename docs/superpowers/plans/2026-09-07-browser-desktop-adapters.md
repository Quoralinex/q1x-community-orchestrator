# Phase 6 Browser/Web and Desktop/Application Adapter Implementation Plan

**Goal:** Deliver standards-based browser control plus a neutral cross-platform desktop/application bridge through the existing executable adapter runtime.

**Spec:** `docs/superpowers/specs/2026-09-07-browser-desktop-adapters-design.md`

## Constraints

- No browser vendor, operating system, paid service or cloud provider is mandatory.
- Reuse `AdapterEndpoint`, `ExecutionRequest`, `ExecutionResult` and the existing adapter registry.
- Use the existing public adapter taxonomy values `browser-control` and `desktop-control`.
- No shell execution.
- Remote HTTP requires HTTPS; loopback HTTP is allowed.
- Secrets remain environment-reference-only.
- Browser/desktop content is not persisted in runtime audit events.

### Task 1 — Extend executable endpoint contract and SDK types

- Add `browser-control` and `desktop-control` to the executable endpoint schema/type union.
- Add RED schema/type tests for both endpoint kinds.
- Preserve backward compatibility with Phase 5 endpoint documents.

### Task 2 — W3C WebDriver HTTP transport

- Add `webdriver-http-v1`.
- Implement structured browser actions over the W3C WebDriver HTTP endpoints.
- Enforce HTTP transport, endpoint security, bounded timeouts and no automatic redirects.
- Normalize WebDriver `value` responses into `ExecutionResult.output`.
- Add browser capability discovery through `/status`.
- Test against a loopback synthetic WebDriver server.

### Task 3 — Neutral desktop JSON stdio bridge

- Add `desktop-json-stdio-v1`.
- Spawn bridge commands directly with explicit argv and no shell.
- Send a versioned Q1X desktop bridge request envelope over stdin.
- Parse raw JSON or `{ok, output/error}` bridge responses.
- Bound stdout/stderr, enforce timeout/cancellation and preserve environment allowlisting.
- Test against a portable Node bridge fixture.

### Task 4 — Default registry and runtime exports

- Register both transports in `createDefaultAdapterTransportRegistry()`.
- Export the browser and desktop transport factories from the runtime package.
- Verify existing generic `adapter execute` and `adapter discover` CLI commands work without a second CLI surface.

### Task 5 — Examples and public documentation

- Add schema-validated browser and desktop endpoint examples.
- Document browser action payloads, desktop bridge protocol, security and portability.
- Update architecture, README and roadmap to mark Phase 6 implemented in pre-alpha.

### Task 6 — Protected delivery gate

- Run the full repository CI gate through the protected PR workflow.
- Verify compile/tests/audit/package distribution/security boundary/action pinning.
- Squash merge only after required checks pass and verify merged `main`.
