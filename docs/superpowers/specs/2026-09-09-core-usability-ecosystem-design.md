# Phase 12 Core Usability & Ecosystem Completion Design

**Repository:** `Quoralinex/q1x-community-orchestrator`  
**Base:** commissioned public-alpha closeout on protected `main`  
**Date:** 9 September 2026  
**Status:** Approved standalone product-continuation scope

## Purpose

Phase 12 completes the advertised core use case before product hardening. Q1X Community Orchestrator must be installable and practically usable on Windows, macOS and Linux without requiring an ordinary user to write missing Q1X code, compile a bespoke connector, or design internal transport plumbing.

The acceptance boundary is product usability rather than architectural extensibility: the existing SDKs and protocol registries remain extension mechanisms for additional integrations, not substitutes for first-party baseline functionality.

## Product completion rule

A core advertised capability is complete only when a user can install Q1X, configure credentials or grant ordinary operating-system permissions where legitimately required, and then use that capability without developing a missing Q1X component.

Legitimate user prerequisites include supplying an API key, selecting a local model server, granting macOS Accessibility permission, installing a supported browser, or supplying credentials to an MCP/A2A service. They do not include writing a native desktop bridge, writing a Q1X connector for a baseline supported service, editing internal registry code, discovering undocumented endpoint JSON by trial and error, or compiling a first-party integration from source when a normal install route should exist.

## Standalone architecture boundary

Q1X Community Orchestrator is a complete standalone product. Its runtime, mission state, programme/work-graph state, approvals, evidence, audit, recovery, supervision, connector configuration and diagnostics are owned by the Community Orchestrator itself.

The Q1X Control Plane is not part of this architecture. Phase 12 must not add a Control Plane client, API call, authority callback, continuity/capsule callback, endpoint, environment variable, connector profile, doctor check, release dependency, test fixture or privileged adapter path. No Community Orchestrator feature may require that system to be available.

The active product dependency graph is therefore only:

```text
Q1X Community Orchestrator
  -> models
  -> MCP
  -> A2A
  -> local CLI/TUI tools
  -> browser control
  -> first-party desktop bridges
  -> explicitly registered public community adapters
```

Public extension interfaces remain generic. They may connect to operator-selected external systems through documented public protocols, but this repository contains no privileged Quoralinex-private integration route.

Active product documentation should describe this standalone boundary directly. Historical design records may retain historical wording, but they do not create current runtime dependencies or supported integration paths.

## Architecture

Phase 12 keeps the provider-neutral standalone core unchanged and adds a first-party usability layer around the existing extension seams:

1. **First-party native desktop bridges** implement the existing `q1x-desktop-bridge/1` protocol for macOS Accessibility, Windows UI Automation and Linux AT-SPI.
2. **Connector catalogue and profiles** describe supported model, MCP, A2A, CLI/browser and desktop integrations using declarative manifests rather than hard-coded vendor switches.
3. **Installer/configuration commands** expose `list`, `show`, `add`, `configure`, `test`, `enable` and `disable` workflows through the existing JSON-first CLI.
4. **Doctor/preflight diagnostics** inspect OS support, required binaries, permissions, endpoints, environment variables and live connectivity without persisting secrets.
5. **First-party starter integrations** provide working profiles/templates for baseline model transports, MCP, A2A, browser and local CLI use.
6. **End-to-end usability tests** prove representative flows on Windows, macOS and Linux and feed evidence into the compatibility matrix.

No marketplace, arbitrary package auto-loading, remote code execution service or proprietary Quoralinex service dependency is introduced. Installation remains explicit and operator-controlled.

## Workstream 1 — First-party native desktop bridges

### macOS

Provide a shipped macOS bridge package using Accessibility APIs to implement the current normalized desktop action envelope. The baseline supports application/window discovery and focus, inspect/find, click/double-click, type/press/set-value, pointer operations and screenshots where host permission permits. Missing Accessibility permission must produce an actionable diagnostic rather than a generic transport failure. The bridge must never bypass macOS privacy controls.

### Windows

Provide a shipped Windows bridge using Windows UI Automation plus ordinary input/window APIs for the same normalized action families. It must identify unsupported/elevated target boundaries explicitly, never request UAC elevation automatically, preserve the no-shell process boundary and return normalized diagnostics.

### Linux

Provide a shipped Linux bridge using AT-SPI for accessibility-driven application control, with ordinary input/window support only where safely available. It must detect compatible graphical-session/AT-SPI availability, report Wayland/X11/session constraints explicitly and never claim universal Linux desktop support where the accessibility stack is unavailable.

### Distribution

Each bridge has a repository-owned package/install path, versioned bridge-protocol compatibility, deterministic tests, PolyForm Noncommercial licensing metadata and an executable entrypoint usable by the existing `stdio-bridge` backend. Users may grant OS permissions but must not build bridge code themselves.

Desktop bridges communicate only through their local normalized stdio envelope and operating-system APIs. They do not make calls to private or proprietary Quoralinex services.

## Workstream 2 — Connector catalogue

Add a local repository catalogue with deterministic JSON manifests. Each entry records a stable connector id/name, category (`model`, `mcp`, `a2a`, `cli`, `browser`, `desktop`), implementation/protocol, supported operating systems, required commands/binaries, required environment-variable names without secret values, optional endpoint/profile template, compatibility status/evidence, configure/test guidance and first-party/community provenance.

The built-in catalogue contains only repository-reviewed first-party profiles. Phase 12 does not auto-download or execute arbitrary third-party packages. It contains no profile for a private or proprietary Quoralinex service.

## Workstream 3 — Ready-to-use model profiles

Provide named profiles for the three implemented wire-protocol families: OpenAI-compatible Chat Completions, OpenAI-compatible Responses and Anthropic-compatible Messages. Profiles cover local/self-hosted and hosted HTTPS endpoints. CLI configuration guides users through endpoint URL, model id and environment-variable key without storing secret values.

Named provider profiles, where included, remain convenience configuration over public protocol transports and do not create provider dependencies in core routing.

## Workstream 4 — MCP, A2A and local-tool starter ecosystem

Ship tested first-party starter profiles/templates for local MCP stdio, remote MCP Streamable HTTP, A2A Agent Card/JSON-RPC, local JSON stdio tools and local text stdio tools. A starter integration is usable only when the user can provide documented endpoint/command/credential values and run discovery/test commands without writing Q1X code.

## Workstream 5 — Browser usability

Retain Playwright/CDP architecture but add preflight/configuration support that detects supported installed Chromium-family browsers, validates configured browser/CDP endpoints, explains missing-browser remediation, generates managed-browser and existing-CDP profiles, and verifies a minimal local navigation/action flow without requiring internet access.

Q1X does not silently install a browser in Phase 12.

## Workstream 6 — Connector CLI and configuration UX

Add a cohesive, machine-readable command family:

```text
q1x connectors list
q1x connectors show <id>
q1x connectors add <id>
q1x connectors configure <id> ...
q1x connectors test <id>
q1x connectors enable <id>
q1x connectors disable <id>
q1x doctor
q1x doctor --json
```

Commands are deterministic and non-interactive by default. Optional prompts may only wrap explicit flags; CI never depends on interactive input. Configuration stores only non-secret state; secrets remain environment references.

All connector state is stored and resolved by the Community Orchestrator runtime. No external authority or continuity service participates in connector configuration or enablement.

## Workstream 7 — Diagnostics and preflight

`q1x doctor` returns structured checks for runtime/version/state readiness, recognized host OS, first-party desktop bridge executable status, desktop permission/session status where detectable, browser availability, configured model reachability, required environment-variable presence without values, configured MCP/A2A discovery health, local CLI executable presence, compatibility-matrix status and exact remediation.

Diagnostic states are exactly `ok`, `warning`, `blocked`, `unsupported` and `not-configured`.

Doctor is local to the Community Orchestrator and its configured public endpoints. It contains no check for, or dependency on, a private Quoralinex service.

## Workstream 8 — End-to-end product acceptance

Phase 12 is complete only when repository CI and release-candidate verification prove representative no-custom-code flows on all three OS families.

### Windows

- clean install/build/runtime init;
- shipped Windows desktop bridge starts and reports capability status;
- deterministic test application is discovered and controlled through the normalized desktop envelope;
- browser preflight succeeds when a supported runner browser is present;
- deterministic local model-compatible server is registered/invoked from a named profile;
- local MCP starter server is registered, discovered and invoked;
- `q1x doctor --json` reports configured baseline capabilities correctly.

### macOS

The same acceptance chain runs with the macOS first-party bridge. Hosted-runner permission restrictions may use a deterministic harness for permission-sensitive Accessibility behavior, but documentation must distinguish harness verification from physical-host permission verification.

### Linux

The same acceptance chain runs on Ubuntu. If CI lacks a graphical session, a deterministic virtual display/accessibility test environment must exercise the shipped AT-SPI bridge rather than only protocol serialization.

### Standalone acceptance

A deterministic repository audit must prove that active runtime/package/workflow/connector/release surfaces contain no dependency, endpoint, environment variable, callback or connector for a private/proprietary Quoralinex service. This audit is a Phase 12 completion requirement.

## Compatibility evidence

`compatibility/matrix.json` and generated documentation move a surface from `experimental` to `tested` only when a named integration/environment has concrete evidence. Protocol support alone is insufficient.

The matrix covers at minimum Windows/macOS/Linux source install, each first-party desktop bridge, tested Chromium-family browser configurations, all three baseline model protocol profiles against deterministic local fixtures, MCP stdio/Streamable HTTP starter profiles, A2A starter profile, CLI JSON/text starter profiles, and connector catalogue/doctor flows.

## Release/distribution

The current commissioned `v0.1.0-alpha.1` release is immutable. Phase 12 development does not mutate that tag or its assets. A later explicitly commissioned alpha version must include the first-party packages/configurations required by the completed baseline product surface. GitHub release artifacts remain a valid authoritative distribution path even if npm Trusted Publishing is not enabled.

Release artifacts must remain standalone. They must not require private service credentials, private service endpoints or private Quoralinex packages to install, start or perform baseline operations.

## Security boundaries

Phase 12 preserves all Phase 9–11 safety boundaries: no persisted secret values, no shell-string execution, no arbitrary package auto-loading, no silent privilege escalation, no bypass of OS accessibility/privacy controls, metadata-only audit for sensitive execution, bounded process output/timeouts, explicit connector enablement and no claim that compatibility evidence is a security/trust certificate.

The Community Orchestrator's own local governance, approvals, audit, evidence and recovery remain authoritative for this product. No private external authority is introduced.

## Documentation and claim integrity

README, GitHub Pages and user documentation are audited against actual product acceptance evidence. A core capability described as available must be either directly usable through a shipped first-party path or clearly labelled optional/experimental extension functionality. No extension interface may be presented as if the corresponding integration were bundled and ready to use.

Active product documentation must describe the Community Orchestrator as standalone and must not instruct users to configure or connect to a private/proprietary Quoralinex service.

## Completion gate

Phase 12 is **100% complete** only when:

- all three first-party desktop bridges are shipped through normal install/package paths;
- baseline model/MCP/A2A/CLI/browser profiles are usable without Q1X code changes;
- connector catalogue/configure/test/enable flows work;
- `q1x doctor` gives actionable cross-platform diagnostics;
- end-to-end Windows/macOS/Linux product acceptance is green;
- compatibility evidence is updated from actual tests;
- public documentation matches tested reality;
- standalone architecture audit proves no private/proprietary Quoralinex service dependency exists in active product surfaces;
- no advertised baseline capability requires a user to develop a missing Q1X component.

Only after this gate passes does the project proceed to product hardening, security/reliability testing or beta-readiness work.
