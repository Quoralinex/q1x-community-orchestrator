# Compatibility Matrix

**Matrix version:** 1.0.0  
**Project version:** 0.1.0-alpha.1  
**Evidence baseline:** `3f249d836dac51725691b6dfe83a9c7d85842c50`

## Status legend

- **tested** — verified by the evidence recorded in this matrix.
- **experimental** — available or plausible only under the stated caveats; not a tested compatibility guarantee.
- **unsupported** — explicitly outside the supported/tested surface.

> Absence from this matrix is not a compatibility claim.

## os

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| macOS latest source install | tested | Node.js 24 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | — |
| Ubuntu 24.04 source install | tested | Node.js 24 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | — |
| Windows latest source install | tested | Node.js 24 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | — |

## deployment

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Linux Docker/OCI non-root deployment | tested | Docker multi-stage image | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | — |

## package-consumer

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Governed four-package Q1X alpha tarballs in an external consumer | tested | npm pack tarballs | — | ci: `.github/workflows/public-alpha.yml` @ `3f249d836dac51725691b6dfe83a9c7d85842c50`<br>ci: `tests/release-adapter-governance.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50`<br>ci: `tests/release-commissioning.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | — |

## model-transport

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Provider/model endpoint combinations | experimental | Provider-neutral compatible HTTP transports | — | — | Specific provider, model and endpoint combinations require separate verification before being labelled tested. |

## adapter

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| A2A JSON-RPC agents | experimental | Built-in A2A transport | — | — | Remote agent implementations and deployment environments vary and require explicit compatibility evidence. |
| Local CLI/TUI adapters | experimental | Direct no-shell stdio transports | — | — | Executable-specific behavior depends on the operator-installed tool and is not universally compatible. |
| MCP stdio and Streamable HTTP adapters | experimental | Built-in MCP transports | — | — | Protocol behavior is covered by runtime tests, but environment/server combinations require explicit compatibility evidence before promotion to tested. |

## browser

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Chromium-family browser control | experimental | Playwright/CDP backend | — | — | Browser binaries are not bundled and host/browser-version combinations require explicit evidence before promotion to tested. |

## desktop

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Desktop/application control through the stdio bridge | experimental | OS-neutral desktop bridge | — | — | Native driver availability and application behavior are host-specific and require explicit evidence before promotion to tested. |

## protocol

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Community Adapter SDK conformance and explicit runtime bridge | tested | @quoralinex/q1x-community-adapter-sdk | 0.1.0-alpha.1 / contract 1.0.0 / runtime 0.1.x | ci: `tests/adapter-sdk.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50`<br>ci: `tests/community-adapter-example.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50`<br>ci: `tests/runtime-community-adapter.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | This tested status covers the public SDK compatibility tuple, conformance runner, deterministic local reference adapter and explicit runtime bridge. It does not certify arbitrary third-party adapter protocols or code as trusted. |

