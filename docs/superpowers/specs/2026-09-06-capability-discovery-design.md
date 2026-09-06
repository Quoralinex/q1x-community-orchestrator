# Phase 3 Capability Discovery and Live Registry Design

## Goal

Deliver a provider-neutral, OS-neutral capability discovery system that detects what a host can actually use and persists those results in the existing Open Control Runtime.

## Architectural rule

The core runtime MUST NOT hard-code AI vendors, model names, desktop applications, or CLI products. Detection is manifest-driven. Community or private plugins may ship vendor-specific manifests without changing the discovery engine.

The existing Phase 1 `CapabilityDescriptor` remains the live registry record. The existing `AdapterManifest` remains the connection description. Phase 3 adds only the missing public contract that describes discovery probes.

## Discovery manifest

`DiscoveryManifest` is a JSON Schema 2020-12 contract under `packages/contracts/schemas/v1/`. It contains identity/version, supported platforms, activation mode (`any` or `all`), one or more probes, and a capability template.Probe kinds are deliberately generic:

- `command`: succeed when one of a declared set of executable names resolves on `PATH`; may optionally run a safe version argument with a bounded timeout.
- `path`: succeed when one of a declared set of filesystem paths exists. Home-directory expansion is supported; manifests may restrict the probe to specific platforms.
- `environment`: succeed when required configuration-key names are present. Values are never persisted or returned.
- `http`: perform an unauthenticated GET or HEAD against a declared URL with a short timeout and accepted status codes. Phase 3 does not ingest credentials or secrets into HTTP probes.

A manifest may combine probes with `activation: any` or `activation: all`. Unsupported platform probes are skipped, not treated as failures.

## Capability production

The manifest contains a capability template with id, name, adapter kind, operations, modalities, cost, privacy, trust, platforms and metadata. Discovery fills only the live fields: availability state, checked timestamp and discovery detail.

An activated manifest produces `availability.state = available`. A manifest with applicable probes that do not activate produces `offline`. A manifest with no applicable probes on the current host produces `unknown`. Successful discovery raises trust to at least `discovered`, but never silently raises it to `configured`, `validated` or `trusted`.## Live registry

`OpenControlRuntime` stores capability descriptors and adapter manifests in the same versioned SQLite document store used by missions and programmes. Registry records are global rather than programme-scoped.

Runtime methods:

- `putCapability`, `getCapability`, `listCapabilities`
- `putAdapterManifest`, `getAdapterManifest`, `listAdapterManifests`
- `discover(manifest)` for a single manifest
- `discoverMany(manifests)` for a pack/directory

Each discovery run appends an audit event containing manifest id, capability id, activation result, probe kinds and timestamps. Secret values are never recorded.

## CLI

The JSON-first CLI adds:

- `q1x discover --manifest <file-or-directory>`
- `q1x capabilities list`
- `q1x capabilities get <id>`
- `q1x adapters list`

Directory discovery loads `*.discovery.json` files in lexical order so results are deterministic.## Error handling and safety

Manifest schema errors fail before probes run. A single probe failure is captured as a probe result and does not crash discovery unless the manifest itself is invalid. Command probes never use a shell; they execute resolved binaries directly with fixed argument arrays. HTTP probes use bounded timeouts and do not follow credential-bearing redirects or read environment secrets.

Path probes do not recurse. Environment probes report only key presence. Discovery metadata may include resolved executable/path and HTTP status, but never environment values, request bodies, cookies, tokens or authorization headers.

## Cross-platform behaviour

The engine maps Node platforms to Q1X `macos`, `windows` and `linux`. `any` applies everywhere. Manifests may include multiple platform-specific probes for equivalent capabilities, allowing Homebrew/macOS, PowerShell/Windows and Linux package paths without branching the core engine.

## Testing and success criteria

Tests must prove schema validation, command/path/environment/http probes, `any`/`all` activation, platform skipping, secret non-disclosure, persistence across restart, deterministic directory loading, CLI round trips and failure isolation. Tests use temporary executables/files and a loopback HTTP server rather than assuming any vendor software is installed.

Phase 3 is complete when a clean checkout can discover synthetic host capabilities, persist them, restart, list the same live registry, and run the same workflow on macOS/Linux/Windows-compatible code paths without a mandatory provider or cloud account.