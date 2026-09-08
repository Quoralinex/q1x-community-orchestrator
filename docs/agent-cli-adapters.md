# MCP, A2A and CLI/TUI Adapters

Phase 5 adds executable adapter endpoints for MCP servers, A2A agents and local CLI/TUI tools while preserving the provider-neutral Q1X execution envelope. Phase 11 adds a separate public Community Adapter SDK so third-party transport implementations can target that same envelope through an explicit runtime bridge.

## Adapter endpoints

Adapter endpoints are persisted `adapter-endpoint` contract documents. They identify an adapter family, protocol and transport configuration without storing secret values.

Built-in protocols are:

- `mcp-stdio-v2`
- `mcp-streamable-http-v2`
- `a2a-jsonrpc`
- `cli-json-stdio`
- `cli-text-stdio`

The runtime dispatches all of them through the same `AdapterTransportRegistry` and returns the existing `ExecutionResult` contract.

## MCP

MCP uses the official Model Context Protocol TypeScript client. Q1X supports local stdio servers and Streamable HTTP servers.

Tool discovery uses MCP `listTools()` and registers each advertised tool as a Q1X capability. Tool execution uses MCP `callTool()` and normalizes structured or text content into `ExecutionResult.output`.

Local stdio endpoint example:

```bash
node packages/runtime/dist/cli.js --home .q1x adapter-endpoints put \
  --file examples/adapter-endpoints/mcp-stdio.endpoint.json

node packages/runtime/dist/cli.js --home .q1x adapter discover adapter.mcp.local-files
```

Remote MCP endpoints must use HTTPS. Loopback HTTP is permitted for local development and self-hosted services.

## A2A

A2A support discovers the public Agent Card and maps advertised skills to Q1X capability descriptors. Execution uses JSON-RPC `message/send`.

A2A working or input-required tasks are represented conservatively as partial results; Q1X does not fabricate successful completion from a non-terminal agent state.

Remote credentials are referenced by environment-variable name in endpoint configuration. The value is resolved only at invocation time.

## CLI/TUI

CLI transports spawn an executable directly with an explicit argument array. They never invoke a shell. JSON and text stdin/stdout modes are supported, with bounded output and configurable timeouts.

Only explicitly mapped environment values are added beyond the minimal process environment needed to locate and run the executable.

```bash
node packages/runtime/dist/cli.js --home .q1x adapter-endpoints put \
  --file examples/adapter-endpoints/cli-json.endpoint.json

node packages/runtime/dist/cli.js --home .q1x adapter execute adapter.cli.local-json \
  --file examples/software-delivery/execution-request.json
```

The example command path is illustrative; configure it for a real local tool before execution.

## Community Adapter SDK

The public `@quoralinex/q1x-community-adapter-sdk` package lets third-party authors implement a `CommunityAdapter`, validate the exact public-alpha compatibility tuple and run the deterministic conformance suite.

The current line is Adapter SDK `0.1.0-alpha.1`, contract `1.0.0`, Community runtime `0.1.x`.

Adapters are installed and registered **explicitly** by the operator. The runtime bridge `communityAdapterTransport(...)` converts a conforming adapter into the existing `AdapterTransport` interface; a host supplies that transport through `OpenControlRuntime.open({ adapterTransports: [...] })` or the existing explicit registry surface.

Community core does not scan packages, auto-load arbitrary modules or maintain a marketplace/secret store. The Adapter SDK is **not a sandbox**, and a passing conformance report is compatibility evidence rather than a trust certificate.

See [Community Adapter SDK](community-adapter-sdk.md), the local [`examples/community-adapter/`](../examples/community-adapter/) reference template and the generated [Compatibility Matrix](compatibility-matrix.md).

## Security and audit

Remote HTTP requires HTTPS, except for loopback development endpoints. Credentials cannot be embedded in URLs or persisted in sensitive static headers.

Adapter execution audit events contain endpoint id, protocol, outcome, duration and sanitized error code only. Request inputs, tool arguments, agent messages and returned content are not copied into audit storage.

MCP clients and transports are closed after discovery or execution. CLI stdout/stderr capture is bounded. Network redirects are not followed automatically when credentials may be attached.

A Community Adapter receives only the bounded bridge context explicitly supplied by the host (`signal`, `env` and `fetch`). It is not handed runtime database, audit-store, browser-session or desktop-backend objects by the Community bridge. Operators must still review arbitrary adapter code and dependencies because normal JavaScript process permissions remain outside conformance.

## Extensibility

Built-in and third-party transports share the existing `AdapterTransportRegistry`. The Phase 11 Community Adapter SDK provides the public authoring/conformance path while retaining explicit registration and duplicate-protocol conflict handling.

This keeps adapter families open to future MCP, A2A, CLI and other interoperable transports without changing the core execution contract or introducing mandatory vendor/provider dependencies.

## Examples

Schema-validated endpoint examples live in `examples/adapter-endpoints/`. The Community Adapter reference template lives in `examples/community-adapter/`.
