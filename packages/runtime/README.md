# Q1X Community Open Control Runtime

`@quoralinex/q1x-community-runtime` is the Node.js reference runtime for the provider-neutral Q1X Community Orchestrator contracts.

Phase 2 provides local SQLite persistence, semantic work-graph validation, durable execution request/result records, programme checkpoints, recovery and the `q1x` CLI. Phase 3 adds manifest-driven capability discovery and a persistent live capability/adapter registry. Phase 4 adds secure provider-neutral model endpoints, pluggable protocol transports and local/hosted model invocation. Phase 5 adds MCP, A2A and CLI/TUI execution. Phase 6A adds real browser/web control through managed Playwright sessions and Chromium-family CDP attachment. Phase 6B adds OS-neutral desktop/application control through a pluggable backend registry and direct JSON stdio bridge.

Requirements: Node.js 24 or newer. No hosted database, model provider, paid API or paid desktop-automation service is required.

The runtime is pre-alpha. JSON Schema 2020-12 in `@quoralinex/q1x-community-contracts` remains normative; this package implements those contracts rather than replacing them.

Use `q1x discover --manifest <file-or-directory>` to populate the live registry, `q1x capabilities list` to inspect it, `q1x endpoints` / `q1x model invoke` for model transport, `q1x browser-endpoints` / `q1x browser run` for browser automation, and `q1x desktop-endpoints` / `q1x desktop run` for desktop/application control. Browser binaries and native desktop bridge implementations are not bundled. See the repository documentation for discovery, model transport, browser control, desktop control, command examples and checkpoint semantics.
