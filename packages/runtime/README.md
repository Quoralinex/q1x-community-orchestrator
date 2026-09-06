# Q1X Community Open Control Runtime

`@quoralinex/q1x-community-runtime` is the Node.js reference runtime for the provider-neutral Q1X Community Orchestrator contracts.

Phase 2 provides local SQLite persistence, semantic work-graph validation, durable execution request/result records, programme checkpoints, recovery and the `q1x` CLI. Phase 3 adds manifest-driven capability discovery and a persistent live capability/adapter registry.

Requirements: Node.js 24 or newer. No hosted database, model provider or paid API is required.

The runtime is pre-alpha. JSON Schema 2020-12 in `@quoralinex/q1x-community-contracts` remains normative; this package implements those contracts rather than replacing them.

Use `q1x discover --manifest <file-or-directory>` to populate the live registry, then `q1x capabilities list` to inspect it. See the repository documentation for discovery, command examples and checkpoint semantics.
