# Q1X Community Adapter SDK

`@quoralinex/q1x-community-adapter-sdk` provides public authoring, validation and conformance helpers for third-party Q1X Community Orchestrator adapters.

Current public-alpha compatibility:

- Adapter SDK `0.1.0-alpha.2`
- contract `1.0.0`
- Community runtime `0.1.x`
- Node.js `>=24`

The package depends only on the public Q1X Community SDK. It does not expose runtime databases, audit stores, browser sessions, desktop backends, private Q1X control-plane interfaces or a secret store.

Use `defineCommunityAdapter(...)` to declare an adapter and `runAdapterConformance(...)` to exercise its metadata, execution, discovery and fixture-safety behavior. The reference adapter is in `examples/community-adapter/`.

Community adapters are ordinary application code selected and registered explicitly by the operator. **This SDK is not a sandbox.** Passing conformance demonstrates compatibility with the tested public contract; conformance does not make third-party code trustworthy or replace source/dependency/security review.

The runtime integration boundary is the explicit `communityAdapterTransport(...)` bridge. No package scanning, marketplace, arbitrary module auto-loading or automatic privilege grant is provided.

See [`docs/community-adapter-sdk.md`](../../docs/community-adapter-sdk.md) and the generated [`docs/compatibility-matrix.md`](../../docs/compatibility-matrix.md) for the full authoring, registration, trust and compatibility guidance.

The package is distributed under the **PolyForm Noncommercial License 1.0.0** as part of the Q1X Community public-alpha package set.
