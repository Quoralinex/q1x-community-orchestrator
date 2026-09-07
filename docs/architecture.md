# Architecture

The architecture is centred on missions and capabilities rather than specific model brands.

Core layers are: mission/goal intake; programme decomposition; work graph; adaptive programme supervision; dynamic teams; open control runtime; live capability registry; capability router; and adapter families for model APIs, local inference, MCP, A2A, CLI/TUI, browser/web control, desktop control, software runtimes and edge/device bridges.

## Phase 1 contract boundary

The first implemented layer is a versioned, language-neutral contract system. JSON Schema 2020-12 defines missions, programmes, work graphs, replanning events, capabilities, adapters, execution envelopes, evidence, artifacts, approvals, checkpoints and deployment profiles.

These contracts are deliberately independent from model brands, operating systems, databases, cloud platforms and CI providers. A TypeScript SDK is supplied as the first reference implementation, but the JSON schemas remain authoritative so Python, Rust, Go, Java, .NET and other implementations can interoperate later.

Schema validation covers document structure. Semantic orchestration rules that require cross-document state—such as proving a work graph is acyclic—belong in later runtime validators rather than being falsely represented as JSON Schema guarantees.

See [Contracts](contracts.md) for the current schema catalog.

## Phase 2 open control runtime

The first runtime implementation is a Node.js 24+ TypeScript package backed by Node's built-in SQLite module. It persists immutable contract-document versions, current head pointers, programme checkpoint snapshots and append-only runtime events in a local `state.sqlite` database.

Every persisted public document is first validated against the normative Phase 1 schemas. Runtime validators then enforce rules that span documents or revisions: referenced missions/programmes must exist, programme and work-graph revisions advance exactly one step, work-graph references and execution dependencies are valid, lifecycle transitions are legal, and execution results match a unique request.

Programme checkpoints restore current head pointers transactionally without deleting immutable history. Mission state is intentionally outside programme restore scope so one programme cannot rewind mission state shared with another programme.

The runtime binds no network port and invokes no external provider in Phase 2. Capability discovery, routing and execution adapters remain separate later layers.

See [Open Control Runtime](runtime.md) for commands and recovery behaviour.

## Phase 3 discovery boundary

Capability discovery is manifest-driven. The core engine understands generic command, path, environment and HTTP probes; it does not know product/vendor names. Discovery produces the existing `CapabilityDescriptor` contract and persists it through the Phase 2 runtime. Adapter/plugin authors can therefore add new products without modifying the orchestrator core.

## Phase 4 model transport boundary

Model transport separates endpoint location/adapter kind from wire protocol. The built-in protocol transports cover OpenAI-compatible chat completions, Responses-compatible endpoints and Anthropic-compatible Messages endpoints, but none of those requires a corresponding hosted provider. Local inference servers can expose the same protocols over loopback HTTP.

Remote endpoints require HTTPS. Credential values are injected from environment variables only at invocation time, redirects are not followed automatically, and model prompt/output content is not persisted by the transport layer. `ModelTransportRegistry` is the extension point for native provider or experimental transports without a provider switch statement in Community core.

See [Provider-Neutral Model Transport](model-transport.md) for endpoint examples and CLI usage.

## Phase 5 executable adapter boundary

Executable adapters use persisted `AdapterEndpoint` documents plus a pluggable `AdapterTransportRegistry`. MCP, A2A and CLI/TUI all reuse the normative `ExecutionRequest` / `ExecutionResult` envelope instead of introducing protocol-specific orchestration state.

MCP uses the official client over stdio or Streamable HTTP, A2A maps Agent Card skills into the live capability registry and executes JSON-RPC messages, and CLI/TUI tools are spawned directly with explicit argv and no shell. Runtime audit events remain metadata-only.

See [MCP, A2A and CLI/TUI Adapters](agent-cli-adapters.md) for configuration and security boundaries.

## Phase 6A browser-control boundary

Browser control uses normative `BrowserEndpoint` and `BrowserActionBatch` contracts plus a pluggable `BrowserBackendRegistry`. The built-in Playwright Core backend implements managed contexts and Chromium-family CDP attachment while live sessions remain memory-only.

Browser endpoint configuration may persist, but cookies, browser storage, authentication material and live session handles do not. Navigation policy, bounded local file access and metadata-only audit events form the control boundary. CLI execution is one-shot; long-lived sessions belong to the host runtime process.

See [Browser and Web Control](browser-control.md).
