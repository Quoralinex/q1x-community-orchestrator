# Changelog

All notable Community Orchestrator release changes are recorded here. The project remains pre-stable until a future release explicitly declares otherwise.

## 0.1.0-alpha.1 — public alpha candidate

### Foundation delivered

- versioned provider-neutral JSON Schema contracts and TypeScript reference SDK;
- SQLite-backed Open Control Runtime, lifecycle state, checkpoints and JSON-first CLI;
- capability discovery and persistent live registry;
- provider-neutral local/hosted model transport;
- MCP, A2A and direct CLI/TUI adapter execution;
- browser/web control with bounded real-browser sessions and explicit CDP support;
- OS-neutral desktop/application contracts and stdio bridge execution;
- dynamic team formation, durable assignments, adaptive programme supervision, budgets and replanning;
- verified Node.js source installation on Linux, macOS and Windows plus non-root Docker/Compose packaging;
- fail-closed single-use approvals, immutable evidence provenance, redacted tamper-evident security audit receipts and restart recovery.

### Public alpha commissioning

- exact version alignment across the four public packages: contracts, core SDK, Community Adapter SDK and runtime;
- governed `npm pack` artifacts for all four public packages;
- machine-readable release manifest and SHA-256 checksum evidence;
- clean external-consumer verification from packed Q1X artifacts;
- fail-closed GitHub public-alpha commissioning workflow;
- GitHub prerelease creation only after validation of the exact protected `main` commit;
- optional npm trusted-publishing lane, disabled unless explicitly authorised;
- source, packed-package and Docker quick-start guidance;
- documented upgrade/rollback procedure and public-alpha known limitations.

### Phase 11 compatibility and extension surface

- machine-readable compatibility declarations with deterministic generated Markdown;
- separate Compatibility Matrix CI gate and drift validation;
- explicit `tested`, `experimental` and `unsupported` compatibility status semantics;
- public `@quoralinex/q1x-community-adapter-sdk` authoring package;
- exact Adapter SDK compatibility tuple: SDK `0.1.0-alpha.1`, contract `1.0.0`, runtime `0.1.x`;
- structured `runAdapterConformance(...)` checks for metadata, execution, discovery and fixture mutation;
- narrow `communityAdapterTransport(...)` runtime bridge with explicit operator registration;
- deterministic local `examples/community-adapter/` reference implementation;
- documented no-auto-loading, no-marketplace, no-secret-store and no-sandbox boundaries;
- conformance explicitly separated from security/trust certification.

### Licence

The public repository and packages retain the PolyForm Noncommercial License 1.0.0. Commercial use requires a separate licence from Quoralinex.

### Stability

This remains an experimental public alpha, not a production or general-availability release. Breaking changes may occur before stable release. A GitHub tag or prerelease is authoritative only after the governed manual Public Alpha Commissioning workflow has actually created it from the verified protected `main` commit; this changelog does not by itself assert that commissioning action has occurred.
