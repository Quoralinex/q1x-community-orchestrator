# MCP, A2A and CLI/TUI Adapters

Phase 5 adds executable adapter endpoints for MCP servers, A2A agents and local CLI/TUI tools while preserving the provider-neutral Q1X execution envelope.

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

## Security and audit

Remote HTTP requires HTTPS, except for loopback development endpoints. Credentials cannot be embedded in URLs or persisted in sensitive static headers.

Adapter execution audit events contain endpoint id, protocol, outcome, duration and sanitized error code only. Request inputs, tool arguments, agent messages and returned content are not copied into audit storage.

MCP clients and transports are closed after discovery or execution. CLI stdout/stderr capture is bounded. Network redirects are not followed automatically when credentials may be attached.

## Extensibility

Third-party transports can register additional protocol ids through `AdapterTransportRegistry` without changing the core runtime. That keeps adapter families open to future MCP, A2A, CLI and other interoperable transports while retaining one execution contract.

## Examples

Schema-validated endpoint examples live in `examples/adapter-endpoints/`.
