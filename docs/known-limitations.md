# Current candidate known limitations

Q1X Community Orchestrator remains experimental software. The historical `v0.1.0-alpha.1` release remains immutable, and `v0.1.0-alpha.2` remains the commissioned GitHub public alpha. Phase 13 prepared `0.2.0-beta.1` as an uncommissioned beta-ready candidate; Phase 14 is implemented and validated on protected `main` as the `1.0.0-rc.1` stable-readiness candidate. Validation-only stable packaging has passed, but `1.0.0` is not commissioned. npm publication remains separately optional. The statements below define important limits of the current Community surface and prevent tested capabilities from being mistaken for broader guarantees.

1. **Local actor identity is caller-asserted.** Approval actor identifiers are not cryptographically authenticated by the current local JSON-first CLI. `requiredApproverKinds` is a governance-contract boundary, not enterprise IAM, signed identity or an authenticated multi-user control plane.

2. **The audit chain is locally tamper-evident, not externally witnessed.** Retained security audit receipts detect modification, link breakage and reordering, but the local hash chain is not an externally anchored transparency log. A party able to rewrite the entire database can potentially remove a complete tail unless an independent witness is added outside the current Community runtime.

3. **Browser binaries are not bundled.** Browser/web control requires a compatible browser supplied and configured by the operator. Managed Chromium-family sessions and explicit CDP attachment do not imply support for every browser, version or operating-system combination.

4. **First-party desktop bridges are shipped, but host readiness is conditional.** Phase 12 includes first-party macOS Accessibility, Windows UI Automation and Linux AT-SPI bridge packages. macOS still requires Accessibility permission, Windows cannot silently cross protected/elevated process boundaries, and Linux requires an accessibility-enabled graphical session with AT-SPI; Wayland policy can restrict global input or capture. A tested bridge/harness is not a claim that every application or OS version works.

5. **Provider endpoints and credentials are user-supplied.** The runtime is provider-neutral. It does not bundle a required commercial model provider or credentials, and the public alpha does not claim that every provider/protocol variant is tested.

6. **The supported baseline is single-node and standalone.** Durable state uses local SQLite and filesystem storage. Distributed workers, PostgreSQL/object-storage profiles and hosted multi-tenant deployment layers are future profiles, not dependencies of the Community baseline. No private Quoralinex service is required for ordinary baseline use.

7. **The stable compatibility promise is scoped.** Breaking changes remain possible before a stable release is commissioned. Phase 14 freezes the intended stable surface in `compatibility/public-surface.rc1.json` and `compatibility/package-surface.rc1.json`; those inventories, not undocumented internals, define the proposed SemVer boundary. Back up runtime state before upgrades and follow the explicit migration/rollback guidance.

8. **npm publication may be unavailable while GitHub artifacts remain available.** GitHub prerelease tarballs are the authoritative public-alpha package artifacts. npm publication is optional and requires separately configured trusted-publishing authority; its absence does not invalidate the governed GitHub release.

9. **Community adapters are not sandboxed by the Adapter SDK.** `@quoralinex/q1x-community-adapter-sdk` validates the public compatibility contract and supplies a conformance runner, but imported adapter code runs with the permissions granted by its host process unless the operator adds an independent isolation mechanism. Installation and registration are explicit operator actions.

10. **Conformance is compatibility evidence, not a trust certificate.** Passing `runAdapterConformance(...)` does not prove that an adapter is safe, non-malicious, correctly licensed, privacy-preserving or appropriate for a workload. Operators remain responsible for reviewing adapter source, dependencies, permissions, network behavior, credential handling and data retention.

11. **Compatibility evidence is scoped.** The compatibility matrix labels surfaces `tested`, `experimental` or `unsupported` against specific repository evidence. Phase 12 promotes only the exact model fixtures, MCP/A2A/CLI profiles, runner browser flow, connector management and desktop harness/session combinations exercised by cited tests. A tested entry does not imply support for uncited operating-system versions, provider variants, browser versions, applications or third-party adapters.

Additional current nonclaims include enterprise IAM, HSM-backed signing, remote attestation, confidential-computing isolation, externally witnessed audit transparency, guaranteed crash-atomicity across every multi-write governance operation, adapter marketplace trust, automatic package vetting and production/SLA support.

Phase 13 improves crash recovery, backup integrity, bounded execution and evidence quality. Phase 14 adds stable-readiness compatibility, migration, restart/soak and dependency evidence, but those controls do not convert the RC candidate into a commissioned stable release, production/SLA claim or guarantee of universal physical-host compatibility.

See [Stable-release readiness](stable-release.md), [Supported platforms](supported-platforms.md), [Upgrade and rollback](upgrade-rollback.md), [Product usability](product-usability.md), [Compatibility Matrix](compatibility-matrix.md) and [Community Adapter SDK](community-adapter-sdk.md). Do not infer compatibility, trust or support beyond the governed inventories and surfaces explicitly exercised by repository evidence.
