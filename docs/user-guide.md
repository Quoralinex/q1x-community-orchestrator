# User Guide

This guide is the shortest path from a clean checkout or release bundle to a usable Q1X Community Orchestrator runtime.

Q1X is standalone and provider-neutral. It has no mandatory control plane and no private Quoralinex service is required for the Community baseline. You supply only the capabilities you actually want to use: local or hosted models, MCP/A2A services, CLIs, browsers or desktop access.

## Install from source

Requirements: Node.js 24+, npm and a supported operating system (macOS, Windows or Linux).

```bash
npm ci --no-audit --no-fund
npm run build
node packages/runtime/dist/cli.js --home .q1x init
```

Use a dedicated runtime home such as `.q1x` or another directory you control. Runtime state is local SQLite plus local evidence/artifact files.

## Check readiness

```bash
node packages/runtime/dist/cli.js --home .q1x doctor --json
node packages/runtime/dist/cli.js --home .q1x limits show
```

`doctor` reports prerequisites and connector readiness without persisting secret values. `limits show` reports the active execution bounds and any weakened overrides.
## Add a connector

List the built-in profiles, add one, configure it, test it, then enable and apply it.

```bash
node packages/runtime/dist/cli.js --home .q1x connectors list
node packages/runtime/dist/cli.js --home .q1x connectors add model.openai-chat.local
node packages/runtime/dist/cli.js --home .q1x connectors configure model.openai-chat.local --parameter baseUrl=http://127.0.0.1:11434/v1
node packages/runtime/dist/cli.js --home .q1x connectors test model.openai-chat.local
node packages/runtime/dist/cli.js --home .q1x connectors enable model.openai-chat.local
node packages/runtime/dist/cli.js --home .q1x connectors apply model.openai-chat.local
```

Remote provider credentials should be supplied through environment-key mappings rather than written into persisted configuration. Connector profiles never make a provider mandatory.

## Native desktop control

```bash
node packages/runtime/dist/cli.js --home .q1x desktop setup-first-party
node packages/runtime/dist/cli.js --home .q1x doctor --json
```

The first-party bridge uses the host operating system's accessibility stack. macOS requires Accessibility permission, Windows has protected/elevated boundaries, and Linux requires a suitable graphical accessibility session.

## Evidence labels

Compatibility evidence is intentionally tiered. `fixture` means deterministic repository test evidence, `hosted-runner` means execution on a hosted CI operating-system runner, and `physical-host` means bounded evidence from an actual machine. One tier must not be read as proof of another.
## Back up before change

```bash
node packages/runtime/dist/cli.js --home .q1x backup create --output ./q1x-backup
node packages/runtime/dist/cli.js backup verify ./q1x-backup
```

A restore targets an empty runtime home; it does not merge two live state directories.

## Where to go next

- [Operator Guide](operator-guide.md) — backup, recovery, audit, limits and operational checks.
- [Developer Guide](developer-guide.md) — contracts, adapters, tests and extension boundaries.
- [CLI Reference](cli-reference.md) — generated command catalogue.
- [Compatibility Matrix](compatibility-matrix.md) — evidence-backed supported/tested surfaces.
- [Known limitations](known-limitations.md) — current nonclaims and constraints.

The current software remains experimental. Treat destructive actions, credentials, native desktop control and third-party adapters as explicit trust boundaries.
