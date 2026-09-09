# Public alpha known limitations

Q1X Community Orchestrator remains experimental software. Phase 12 is implemented on protected `main`. The commissioned `v0.1.0-alpha.1` release is immutable; the separately governed `v0.1.0-alpha.2` candidate has passed Phase 12 commissioning validation but is not yet released and awaits explicit manual commissioning. The statements below define important limits of the current Community surface and prevent tested capabilities from being mistaken for broader guarantees.

1. **Local actor identity is caller-asserted.** Approval actor identifiers are not cryptographically authenticated by the current local JSON-first CLI. `requiredApproverKinds` is a governance-contract boundary, not enterprise IAM, signed identity or an authenticated multi-user control plane.

2. **The audit chain is locally tamper-evident, not externally witnessed.** Retained security audit receipts detect modification, link breakage and reordering, but the local hash chain is not an externally anchored transparency log. A party able to rewrite the entire database can potentially remove a complete tail unless an independent witness is added outside the current Community runtime.

3. **Browser binaries are not bundled.** Browser/web control requires a compatible browser supplied and configured by the operator. Managed Chromium-family sessions and explicit CDP attachment do not imply support for every browser, version or operating-system combination.

4. **First-party desktop bridges are shipped, but host readiness is conditional.** Phase 12 includes first-party macOS Accessibility, Windows UI Automation and Linux AT-SPI bridge packages. macOS still requires Accessibility permission, Windows cannot silently cross protected/elevated process boundaries, and Linux requires an accessibility-enabled graphical session with AT-SPI; Wayland policy can restrict global input or capture. A tested bridge/harness is not a claim that every application or OS version works.

5. **Provider endpoints and credentials are user-supplied.** The runtime is provider-neutral. It does not bundle a required commercial model provider or credentials, and the public alpha does not claim that every provider/protocol variant is tested.

6. **The supported baseline is single-node and standalone.** Durable state uses local SQLite and filesystem storage. Distributed workers, PostgreSQL/object-storage profiles and hosted multi-tenant deployment layers are future profiles, not dependencies of the Community baseline. No private Quoralinex service is required for ordinary baseline use.

7. **Breaking changes remain possible.** Contracts, package APIs, CLI surfaces and durable-state handling may change before a stable release. Back up runtime state before upgrades and follow release-specific migration guidance.

8. **npm publication may be unavailable while GitHub artifacts remain available.** GitHub prerelease tarballs are the authoritative public-alpha package artifacts. npm publication is optional and requires separately configured trusted-publishing authority; its absence does not invalidate the governed GitHub release.

9. **Community adapters are not sandboxed by the Adapter SDK.** `@quoralinex/q1x-community-adapter-sdk` validates the public compatibility contract and supplies a conformance runner, but imported adapter code runs with the permissions granted by its host process unless the operator adds an independent isolation mechanism. Installation and registration are explicit operator actions.

10. **Conformance is compatibility evidence, not a trust certificate.** Passing `runAdapterConformance(...)` does not prove that an adapter is safe, non-malicious, correctly licensed, privacy-preserving or appropriate for a workload. Operators remain responsible for reviewing adapter source, dependencies, permissions, network behavior, credential handling and data retention.

11. **Compatibility evidence is scoped.** The compatibility matrix labels surfaces `tested`, `experimental` or `unsupported` against specific repository evidence. Phase 12 promotes only the exact model fixtures, MCP/A2A/CLI profiles, runner browser flow, connector management and desktop harness/session combinations exercised by cited tests. A tested entry does not imply support for uncited operating-system versions, provider variants, browser versions, applications or third-party adapters.

Additional current nonclaims include enterprise IAM, HSM-backed signing, remote attestation, confidential-computing isolation, externally witnessed audit transparency, guaranteed crash-atomicity across every multi-write governance operation, adapter marketplace trust, automatic package vetting and production/SLA support.

See [Product usability](product-usability.md), [Compatibility Matrix](compatibility-matrix.md) and [Community Adapter SDK](community-adapter-sdk.md) for the Phase 12 baseline, evidence and extension boundaries. Do not infer compatibility or trust beyond the surfaces explicitly exercised by repository CI and documented for the validated alpha.2 candidate.
