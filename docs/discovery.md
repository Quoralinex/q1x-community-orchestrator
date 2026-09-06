---
layout: default
title: Capability discovery
---

# Capability discovery and live registry

Phase 3 lets the Open Control Runtime discover what a host can actually use and persist the result as normal Q1X `CapabilityDescriptor` records.

Discovery is **manifest-driven**. The runtime does not contain a hard-coded list of AI vendors, model names, desktop applications or CLI products. A discovery manifest describes generic probes and the capability they produce.

## Probe types

| Probe | Purpose |
| --- | --- |
| `command` | Resolve declared executable names on `PATH`; optionally run fixed version arguments. |
| `path` | Check declared filesystem paths, with home-directory expansion. |
| `environment` | Check configuration-key presence without exposing values. |
| `http` | Check an unauthenticated local/remote HTTP endpoint with a bounded timeout. |

Manifests can combine probes with `activation: any` or `activation: all`, and individual probes may be limited to macOS, Windows, Linux or other contract platforms.
## Run discovery

Build the runtime, then point `q1x` at one manifest or a directory containing `*.discovery.json` files:

```bash
npm run build
node packages/runtime/dist/cli.js --home .q1x discover --manifest examples/discovery
```

Directory manifests are loaded in lexical order. The command returns JSON discovery results and writes the resulting capabilities into the same SQLite runtime used by missions and programmes.

Inspect the registry later—even from a separate process:

```bash
node packages/runtime/dist/cli.js --home .q1x capabilities list
node packages/runtime/dist/cli.js --home .q1x capabilities get capability.example-local-command
node packages/runtime/dist/cli.js --home .q1x adapters list
```

## Availability and trust

A successful manifest produces `available`; applicable probes that do not satisfy activation produce `offline`; a manifest with no applicable probes produces `unknown`. Successful discovery may raise `unverified` trust to `discovered`, but discovery never silently declares a capability configured, validated or trusted.
## Security boundary

Command probes execute resolved binaries directly with fixed argument arrays and no shell. Environment probes record only which key names are present. HTTP probes do not accept credentials, do not follow redirects automatically, do not read response bodies and reduce failures to safe error names. Discovery metadata never stores environment values, cookies, authorization headers or browser sessions.

Vendor-specific integrations belong in optional discovery packs/plugins. This keeps the Community runtime usable with local tools, free services, commercial APIs or future providers without changing the core.

See [`examples/discovery/`](../examples/discovery/) for provider-neutral manifest examples.