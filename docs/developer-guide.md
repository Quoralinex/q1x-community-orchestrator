# Developer Guide

This guide is for contributors extending Q1X Community Orchestrator without weakening its standalone, provider-neutral or evidence boundaries.

The Community repository has no mandatory control plane and no private Quoralinex service dependency. Public code, schemas, examples, tests and release artifacts must remain self-contained.

## Repository model

- `packages/contracts/` — normative JSON Schema contracts.
- `packages/sdk-typescript/` — public TypeScript SDK types and helpers.
- `packages/runtime/` — standalone runtime and CLI.
- `packages/adapter-sdk/` — public Community Adapter SDK.
- `packages/desktop-bridge-*` — first-party native desktop bridge packages.
- `tests/` — deterministic, integration and governance tests.
- `compatibility/` — compatibility source data and evidence definitions.
- `scripts/` — release, verification and documentation generators.

## Local development

```bash
npm ci --no-audit --no-fund
npm run build
npm test
npm run check
```

Use Node.js 24+. Keep source manifests on the commissioned release identity unless a governed release task explicitly stages another version.
## Contracts and compatibility

JSON Schema is normative for the public contract layer. Additive compatible changes belong in the existing major version; incompatible changes require an explicit version boundary rather than silent reinterpretation.

Compatibility evidence must declare its environment tier:

- `fixture` — deterministic repository-controlled execution.
- `hosted-runner` — execution on a hosted CI machine or operating-system runner.
- `physical-host` — bounded sanitized evidence from an actual machine.

Do not promote a fixture or hosted-runner result into a physical-host claim. New `tested` matrix entries require concrete evidence; experimental entries require explicit caveats.

## Adding a connector or adapter

Prefer configuration and existing transport contracts before adding a new backend. A Community Adapter must pass the public conformance runner, but conformance is not a sandbox or trust certificate.

Third-party code is loaded only through explicit operator-controlled registration. Do not auto-discover and execute arbitrary packages, persist secrets, or introduce hidden network dependencies.

## Security boundaries

Protected work must continue to use approvals and bounded execution. Keep credentials in environment-backed configuration where supported. Routine audit receipts should contain metadata rather than prompts, page contents, desktop contents or credential material.

Local audit verification is tamper-evident only; it is not an externally anchored transparency system.
## Test-first changes

For behaviour changes, add a failing test that demonstrates the required outcome, then make the smallest implementation change that turns it green. Preserve existing release, compatibility and standalone governance tests.

For generated documentation or evidence, the checked-in artifact must have a `--check` path that fails when source and generated output diverge.

## Release development

The commissioned Alpha 2 source manifests remain unchanged in the repository. Beta preparation stages `0.2.0-beta.1` into a temporary release tree, verifies exact internal dependency versions, generates SHA-256 and SPDX evidence, and compares independent clean builds before a beta can be considered for commissioning.

A beta candidate is not commissioned merely because staging succeeds. Tag creation, release publication and any npm publication remain separate governed actions.

## Documentation

The user-facing operating set is:

- [User Guide](user-guide.md)
- [Operator Guide](operator-guide.md)
- [CLI Reference](cli-reference.md)
- this Developer Guide

Update executable CLI metadata in `packages/runtime/src/cli-catalogue.ts`; regenerate the CLI reference rather than editing it manually.

See also [Contracts](contracts.md), [Community Adapter SDK](community-adapter-sdk.md), [Compatibility Matrix](compatibility-matrix.md) and [Known limitations](known-limitations.md).
