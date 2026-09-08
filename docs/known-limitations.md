# Public alpha known limitations

Q1X Community Orchestrator `0.1.0-alpha.1` is experimental software. The statements below define important limits of the current Community release and prevent tested capabilities from being mistaken for broader guarantees.

1. **Local actor identity is caller-asserted.** Approval actor identifiers are not cryptographically authenticated by the current local JSON-first CLI. `requiredApproverKinds` is a governance-contract boundary, not enterprise IAM, signed identity or an authenticated multi-user control plane.

2. **The audit chain is locally tamper-evident, not externally witnessed.** Retained security audit receipts detect modification, link breakage and reordering, but the local hash chain is not an externally anchored transparency log. A party able to rewrite the entire database can potentially remove a complete tail unless an independent witness is added outside the current Community runtime.

3. **Browser binaries are not bundled.** Browser/web control requires a compatible browser supplied and configured by the operator. Managed Chromium-family sessions and explicit CDP attachment do not imply support for every browser, version or operating-system combination.

4. **Native desktop drivers are not universally bundled.** Desktop contracts and the stdio bridge are portable Community surfaces, while macOS Accessibility, Windows UI Automation, Linux AT-SPI and application-specific desktop controllers remain optional bridge implementations.

5. **Provider endpoints and credentials are user-supplied.** The runtime is provider-neutral. It does not bundle a required commercial model provider or credentials, and the public alpha does not claim that every provider/protocol variant is tested.

6. **The supported baseline is single-node.** Durable state uses local SQLite and filesystem storage. Distributed workers, PostgreSQL/object-storage profiles and hosted multi-tenant control planes are future deployment layers, not part of the first public alpha.

7. **Breaking changes remain possible.** Contracts, package APIs, CLI surfaces and durable-state handling may change before a stable release. Back up runtime state before upgrades and follow release-specific migration guidance.

8. **npm publication may be unavailable while GitHub artifacts remain available.** GitHub prerelease tarballs are the authoritative public-alpha package artifacts. npm publication is optional and requires separately configured trusted-publishing authority; its absence does not invalidate the governed GitHub release.

Additional current nonclaims include enterprise IAM, HSM-backed signing, remote attestation, confidential-computing isolation, externally witnessed audit transparency, guaranteed crash-atomicity across every multi-write governance operation, and production/SLA support.

Phase 11 will publish the broader tested/experimental/unsupported compatibility matrix and the Community Adapter SDK. Until then, do not infer compatibility beyond the surfaces explicitly exercised by repository CI and documented for this alpha.
