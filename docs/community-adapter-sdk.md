# Community Adapter SDK

Phase 11 adds the public `@quoralinex/q1x-community-adapter-sdk` package for authoring and checking third-party Q1X Community Orchestrator adapter transports without exposing private Q1X control-plane material or runtime internals.

The current public-alpha compatibility tuple is:

- Adapter SDK: `0.1.0-alpha.1`
- Q1X contract version: `1.0.0`
- compatible Community runtime line: `0.1.x`
- Node.js: `>=24`

The Adapter SDK depends only on the public `@quoralinex/q1x-community-sdk` package. It does not expose the runtime database, audit store, browser sessions, desktop backends, private Q1X APIs, secret storage or proprietary policy/prompt material.

## Authoring surface

A community adapter implements the public `CommunityAdapter` interface and declares a protocol plus the exact compatibility tuple. `defineCommunityAdapter(...)` validates the declaration and returns the same adapter object. `validateCommunityAdapter(...)` and `assertCommunityAdapter(...)` provide structured metadata checks.

A minimal adapter therefore owns only its protocol-specific execution and optional discovery behavior. The runtime remains responsible for its own endpoint contracts, execution lifecycle, persistence and audit boundaries.

The deterministic local reference implementation lives at [`examples/community-adapter/`](../examples/community-adapter/). It uses protocol `community.echo`, performs no network calls, requires no credentials and returns one local capability.

## Conformance

`runAdapterConformance(adapter, options)` checks the public adapter contract without exiting the host process. The current conformance suite checks:

- adapter metadata and exact compatibility values;
- protocol syntax and length;
- execution-result contract references and status shape;
- discovery capability structure and normative enum values;
- mutation of supplied endpoint/request fixtures;
- propagation of an explicitly supplied abort signal.

Passing conformance means the adapter behaved consistently with the tested public contract. **Conformance does not establish trust, security, provenance or suitability for a particular workload.**

The SDK is **not a sandbox**. A JavaScript adapter runs with the permissions of the process that imports it unless the operator supplies a separate isolation mechanism.

## Runtime bridge and explicit registration

The Community runtime exposes `communityAdapterTransport(adapter)` as a narrow bridge into the existing `AdapterTransport` abstraction. A host can explicitly register the resulting transport when opening the runtime:

```ts
import { communityAdapterTransport, OpenControlRuntime } from '@quoralinex/q1x-community-runtime';
import { communityEchoAdapter } from './adapter.js';

const runtime = OpenControlRuntime.open({
  home: '.q1x',
  adapterTransports: [communityAdapterTransport(communityEchoAdapter)],
});
```

Installation and registration are **operator-controlled**. Community core does not scan installed packages, download adapters, maintain an adapter marketplace, auto-load arbitrary modules or provide a secret store.

The bridge forwards only the existing bounded transport context: `signal`, `env` and `fetch` when supplied by the host. It does not hand an adapter direct access to the runtime SQLite store, security-audit database, browser-session manager or desktop-backend registry.

Duplicate protocol registration continues to fail closed through the existing transport registry.

## Security and trust model

Before using a third-party adapter, operators should review its source, dependency graph, requested operating-system permissions, network behavior, credential handling, data retention and protocol endpoints. Conformance is useful compatibility evidence, but it is not a replacement for that review.

Adapters that use credentials should receive them through explicit host configuration rather than embedding values in package source or endpoint documents. Remote transports remain subject to the Community runtime's existing endpoint security policies where those runtime transports are used.

There is no private Q1X trust service, code-signing authority, remote attestation service or automatic approval bypass in this package.

## Compatibility evidence

The repository's evidence-driven [compatibility matrix](compatibility-matrix.md) labels tested, experimental and unsupported surfaces separately. A `tested` matrix entry means the stated tuple is exercised by the cited repository CI evidence; it is not a universal guarantee for uncited provider, browser, operating-system, application or adapter versions.

The machine-readable matrix is validated in CI and the human-readable Markdown is generated deterministically so documentation cannot silently drift from the declared evidence set.

## Versioning

The current Adapter SDK is intentionally pre-stable. Its exact compatibility line is `0.1.0-alpha.1` / contract `1.0.0` / runtime `0.1.x`. Public Q1X alpha-package dependencies are exact-version locked rather than caret/range dependencies.

Breaking changes may occur before a stable release. Adapter authors should run the conformance suite against the exact target release and review release-specific compatibility evidence before upgrading.

## Distribution and licence

The Adapter SDK is one of four governed public-alpha package artifacts: contracts, core SDK, Adapter SDK and runtime. GitHub release artifacts remain the authoritative package path even when optional npm Trusted Publishing has not been commissioned.

The public repository and Adapter SDK use the **PolyForm Noncommercial License 1.0.0**. Review [`LICENSE`](../LICENSE) and [`COMMERCIAL-LICENSING.md`](../COMMERCIAL-LICENSING.md) before reuse or distribution.
