# Compatibility Matrix

**Matrix version:** 1.0.0  
**Project version:** 0.1.0-alpha.1  
**Evidence baseline:** `371b27e265a5922184d0a48f57b966b9fbae959b`

## Status legend

- **tested** — verified by the evidence recorded in this matrix.
- **experimental** — available or plausible only under the stated caveats; not a tested compatibility guarantee.
- **unsupported** — explicitly outside the supported/tested surface.

> Absence from this matrix is not a compatibility claim.

## os

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Ubuntu 24.04 source install | tested | Node.js 24 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `371b27e265a5922184d0a48f57b966b9fbae959b` | — |
| Windows latest source install | tested | Node.js 24 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `371b27e265a5922184d0a48f57b966b9fbae959b` | — |
| macOS latest source install | tested | Node.js 24 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `371b27e265a5922184d0a48f57b966b9fbae959b` | — |

## deployment

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Linux Docker/OCI non-root deployment | tested | Docker multi-stage image | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `371b27e265a5922184d0a48f57b966b9fbae959b` | — |

## package-consumer

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Governed Q1X alpha tarballs in an external consumer | tested | npm pack tarballs | — | ci: `.github/workflows/public-alpha.yml` @ `371b27e265a5922184d0a48f57b966b9fbae959b`<br>ci: `tests/release-commissioning.test.mjs` @ `371b27e265a5922184d0a48f57b966b9fbae959b` | — |

## model-transport

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Provider/model endpoint combinations | experimental | Provider-neutral compatible HTTP transports | — | — | Specific provider, model and endpoint combinations require separate verification before being labelled tested. |

## adapter

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| A2A JSON-RPC agents | experimental | Built-in A2A transport | — | — | Remote agent implementations and deployment environments vary and require explicit compatibility evidence. |
| Local CLI/TUI adapters | experimental | Direct no-shell stdio transports | — | — | Executable-specific behavior depends on the operator-installed tool and is not universally compatible. |
| MCP stdio and Streamable HTTP adapters | experimental | Built-in MCP transports | — | — | Protocol behavior is covered by runtime tests, but the formal Phase 11 matrix has not yet promoted environment/server combinations to tested. |

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
| Third-party Community Adapter SDK protocols | unsupported | Not yet implemented on this matrix baseline | — | — | Phase 11 will replace this baseline entry with conformance-backed compatibility once the separate adapter SDK is implemented. |

