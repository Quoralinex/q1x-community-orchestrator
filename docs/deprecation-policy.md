# Deprecation policy

This policy applies once a stable `1.x` release is commissioned. `1.0.0-rc.1` is a release candidate and `1.0.0` is not commissioned by the current source state.

## Requirements

A public-surface deprecation must identify the affected interface, explain why it is deprecated, name a replacement, and provide migration guidance before removal is considered. Deprecation notices should be visible in the relevant API, CLI or documentation surface and in release notes where applicable.

A minor release must not remove a governed public surface that was available in the previous stable minor line. A patch release must not remove a governed public surface. Removal or an incompatible signature/contract change requires a major version unless the surface was never part of the governed stable inventory.

Where practical, a deprecated surface should remain functional for at least one normal minor-release transition so users can migrate deliberately. Security fixes may disable unsafe behaviour sooner, but the release must document the reason, affected surface and replacement or recovery path.

## Durable state

State migrations are not treated as invisible implementation details. Releases that require a migration must document inspection, dry-run, backup, apply and rollback expectations. Unsupported downgrade paths must fail closed rather than imply safe reversal.

The compatibility scope is defined by `compatibility/public-surface.rc1.json` and `compatibility/package-surface.rc1.json`; deprecation policy does not expand the promise beyond those governed inventories.

The project remains under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial use.
