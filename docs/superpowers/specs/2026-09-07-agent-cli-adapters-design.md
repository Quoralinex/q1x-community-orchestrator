# Phase 5 MCP, A2A and CLI/TUI Adapter Design

**Status:** Approved roadmap implementation
**Date:** 7 September 2026

## Objective

Add provider-neutral execution adapters for MCP, A2A and local CLI/TUI processes without making any model, vendor, hosted service or operating system mandatory.

Phase 5 connects existing `ExecutionRequest` / `ExecutionResult` orchestration envelopes to external capabilities. It does not replace the Phase 3 capability registry or Phase 4 model transport layer.

## Design principles

- One neutral adapter endpoint contract; protocol-specific transports sit behind it.
- MCP uses the official client implementation rather than a private MCP dialect.
- A2A follows public Agent Card discovery and JSON-RPC message sending.
- CLI/TUI execution never invokes a shell; commands and arguments are explicit arrays.
- Secrets are referenced by environment-key name and resolved only at execution.
- Local subprocess environments are allowlisted rather than blindly inheriting all secrets.
- No prompt, command input or remote-agent output is persisted by the adapter transport itself.
## Endpoint contract

`AdapterEndpoint` is a persisted, credential-reference-only profile with:

- `adapterKind`: `mcp`, `a2a` or `cli-tui`.
- `protocol`: an extensible string such as `mcp-stdio`, `mcp-streamable-http`, `a2a-jsonrpc`, `cli-json-stdio` or `cli-text-stdio`.
- `transport`: either an HTTP profile or an explicit subprocess profile.
- `capabilityIds`: optional links into the existing live capability registry.
- optional non-secret metadata.

HTTP endpoints use the same remote-HTTPS / loopback-HTTP security rule as model endpoints. Sensitive headers use environment references only.

Subprocess endpoints contain an executable, argument array, optional working directory, timeout/output limits and explicit environment mappings. No shell command string is supported.

## Unified execution

`OpenControlRuntime.executeAdapter(endpointId, request)` validates the existing execution request, resolves the endpoint and dispatches by protocol through an in-memory `AdapterTransportRegistry`.

Every transport returns the existing normative `ExecutionResult`. Runtime audit events contain endpoint/protocol/status/duration only; request input and returned content are not copied into audit storage.
## MCP adapter

MCP support initially covers:

- stdio client connections for local process-spawned MCP servers;
- Streamable HTTP client connections for remote or local HTTP MCP servers;
- tool discovery via `listTools()`;
- tool execution via `callTool()`;
- normalized text/structured content returned through `ExecutionResult.output`.

Tool discovery may register/update capability descriptors. The adapter does not require a model; it is a tool/resource transport.

## A2A adapter

A2A support initially covers:

- Agent Card retrieval from `/.well-known/agent-card.json` or an explicit card URL;
- capability creation from advertised skills;
- synchronous `message/send` over JSON-RPC 2.0;
- task/message response normalization into `ExecutionResult`;
- terminal, input-required and working task states represented without fabricating completion.

Streaming and push-notification execution remain compatible future extensions; Phase 5 does not require inbound public webhooks.

## CLI/TUI adapter

CLI support provides text and JSON stdin/stdout modes, bounded output capture, timeout/cancellation, explicit arguments and allowlisted environment mapping. It is cross-platform at the process layer and does not assume Bash, zsh, PowerShell or CMD syntax.
## Security and portability

- Remote HTTP must use HTTPS; loopback HTTP is permitted for local development/services.
- Redirects are not automatically followed when credentials may be attached.
- CLI commands are spawned directly with `shell: false` semantics.
- Working directories are explicit and must exist.
- Environment secrets are mapped from named host keys and never serialized back into endpoint state.
- stdout/stderr capture is bounded to prevent unbounded memory growth.
- Protocol/network errors are sanitized before entering runtime error messages.
- macOS, Windows and Linux are first-class process targets; platform-specific manifests remain optional plugins.

## Testing

All protocol tests use local loopback fixtures or local synthetic subprocesses. MCP tests run an in-repository local MCP test server; A2A tests use a loopback Agent Card/JSON-RPC server; CLI tests use Node as a portable child process.

Acceptance requires the full existing repository suite, new adapter tests, TypeScript strict compilation, package dry-runs, zero high-severity npm audit findings, public/private boundary scan, SHA-pinned Actions and protected GitHub PR checks.

## Out of scope for Phase 5

Browser/web UI automation, desktop GUI control, physical-device control, automatic dynamic-team formation and adaptive programme scheduling remain later roadmap phases.