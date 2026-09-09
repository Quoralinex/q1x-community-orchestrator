# Compatibility Matrix

**Matrix version:** 1.0.0
**Project version:** 0.1.0-alpha.2
**Evidence baseline:** `105b9ab6c13ea427d3abb09a907e27b920a543c1`

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
| Local Anthropic-compatible Messages deterministic fixture | tested | anthropic-messages transport | — | ci: `tests/runtime-model-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| Local OpenAI-compatible Chat Completions deterministic fixture | tested | openai-chat-completions transport | — | ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-model-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| Local OpenAI-compatible Responses deterministic fixture | tested | openai-responses transport | — | ci: `tests/runtime-model-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| Provider/model endpoint combinations | experimental | Provider-neutral compatible HTTP transports | — | — | Specific provider, model and endpoint combinations require separate verification before being labelled tested. |

## adapter

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| A2A JSON-RPC agents | experimental | Built-in A2A transport | — | — | Remote agent implementations and deployment environments vary and require explicit compatibility evidence. |
| A2A JSON-RPC deterministic agent fixture | tested | a2a-jsonrpc | — | ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-a2a-profile.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| Local CLI/TUI adapters | experimental | Direct no-shell stdio transports | — | — | Executable-specific behavior depends on the operator-installed tool and is not universally compatible. |
| Local JSON stdio CLI deterministic fixture | tested | cli-json-stdio | — | ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-cli-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| Local text stdio CLI deterministic fixture | tested | cli-text-stdio | — | ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-cli-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| MCP stdio and Streamable HTTP adapters | experimental | Built-in MCP transports | — | — | Protocol behavior is covered by runtime tests, but environment/server combinations require explicit compatibility evidence before promotion to tested. |
| MCP stdio deterministic server fixture | tested | mcp-stdio-v2 | — | ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-mcp-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |
| MCP Streamable HTTP loopback deterministic server fixture | tested | mcp-streamable-http-v2 | — | ci: `tests/runtime-mcp-profiles.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |

## browser

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Chromium-family browser control | experimental | Playwright/CDP backend | — | — | Browser binaries are not bundled and host/browser-version combinations require explicit evidence before promotion to tested. |
| Managed Chromium-family browser product flow on supported CI runner browser | tested | browser-playwright-managed | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | Tested only against browser binaries available in the cited CI environment; this is not a universal Chromium/browser-version claim. |

## desktop

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Desktop/application control through the stdio bridge | experimental | OS-neutral desktop bridge | — | — | Native driver availability and application behavior are host-specific and require explicit evidence before promotion to tested. |
| First-party Linux AT-SPI bridge on Ubuntu 24.04 virtual accessibility session | tested | @quoralinex/q1x-community-desktop-bridge-linux 0.1.0-alpha.2 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/desktop-bridge-linux.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | Tested in the repository Ubuntu virtual X11/AT-SPI accessibility session; other desktop environments, compositors and Wayland policies require separate evidence. |
| First-party macOS Accessibility bridge baseline harness | tested | @quoralinex/q1x-community-desktop-bridge-macos 0.1.0-alpha.2 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/desktop-bridge-macos.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | Deterministic bridge contract and host doctor are tested; physical-host Accessibility action execution remains separately dependent on granted OS permission and is not implied by this entry. |
| First-party Windows UI Automation bridge baseline harness | tested | @quoralinex/q1x-community-desktop-bridge-windows 0.1.0-alpha.2 | — | ci: `.github/workflows/cross-platform-packaging.yml` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/desktop-bridge-windows.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | Deterministic bridge contract and host doctor are tested; physical-host application-control behavior remains application/elevation dependent and is not implied by this entry. |

## protocol

| Target | Status | Implementation | Version | Evidence | Constraints / notes |
| --- | --- | --- | --- | --- | --- |
| Community Adapter SDK conformance and explicit runtime bridge | tested | @quoralinex/q1x-community-adapter-sdk | 0.1.0-alpha.1 / contract 1.0.0 / runtime 0.1.x | ci: `tests/adapter-sdk.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50`<br>ci: `tests/community-adapter-example.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50`<br>ci: `tests/runtime-community-adapter.test.mjs` @ `3f249d836dac51725691b6dfe83a9c7d85842c50` | This tested status covers the public SDK compatibility tuple, conformance runner, deterministic local reference adapter and explicit runtime bridge. It does not certify arbitrary third-party adapter protocols or code as trusted. |
| Connector catalogue, configure/apply/test/enable and doctor CLI baseline | tested | Q1X local connector management | — | ci: `tests/product-usability.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-connectors-cli.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1`<br>ci: `tests/runtime-doctor.test.mjs` @ `105b9ab6c13ea427d3abb09a907e27b920a543c1` | — |

