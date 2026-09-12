# Stable versioning policy

Phase 14 prepares `1.0.0-rc.1` as the stable-readiness candidate. `1.0.0` is not commissioned by this source state; stable commissioning remains a separate protected-main authority.

## Semantic Versioning scope

After a stable release is commissioned, Q1X Community Orchestrator intends to follow Semantic Versioning (SemVer) for the governed public compatibility surface. A breaking change to that governed surface requires a new major version. Backward-compatible additions may use a minor version, and backward-compatible fixes may use a patch version.

The stable compatibility promise is intentionally limited to the machine-readable inventories frozen by Phase 14:

- `compatibility/public-surface.rc1.json` for public contracts, exported TypeScript signatures, CLI commands, output envelopes and connector identifiers;
- `compatibility/package-surface.rc1.json` for the eight governed package export maps, bins, Node engine floor, licence declaration, internal dependency policy and packed-file inventory.

Anything outside those inventories is not silently promoted into a stable API guarantee. Implementation details, test fixtures, internal scripts and undocumented internals may change without constituting a public compatibility promise.

## State and CLI compatibility

Durable state is governed separately by the explicit migration registry. A runtime must inspect state before adopting an older layout and must fail closed on unsupported future or invalid state. CLI compatibility covers the governed command catalogue and documented JSON success/error envelopes, not free-form human wording.

## Nonclaims

Stable versioning does not create enterprise IAM, authenticated multi-user identity, an externally witnessed audit log, a distributed control plane, production certification or an SLA. Compatibility evidence remains limited to the exact tested matrix and governed inventories.

Q1X Community Orchestrator remains licensed under the **PolyForm Noncommercial License 1.0.0** unless a separate commercial licence applies.
