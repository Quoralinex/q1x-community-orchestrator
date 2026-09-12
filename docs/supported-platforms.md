# Supported platforms and evidence boundary

`1.0.0-rc.1` is the Phase 14 stable-readiness candidate. `1.0.0` is not commissioned. Platform claims remain evidence-driven rather than inferred from architecture.

The authoritative compatibility matrix labels each surface as `tested`, `experimental` or `unsupported` and ties tested claims to repository evidence. Absence from the compatibility matrix is not a compatibility claim.

## Baseline

The standalone baseline targets Node.js 24+ on macOS, Windows and Linux, plus the documented Linux/Docker path. Exact operating-system, browser, desktop and provider combinations are governed by the compatibility matrix rather than by these broad family names.

Browser binaries are not bundled. Browser support requires an operator-supplied compatible Chromium-family browser where the relevant matrix entry and runner evidence exist.

First-party desktop bridge packages are shipped for macOS Accessibility, Windows UI Automation and Linux AT-SPI, but host readiness remains conditional on permissions, graphical-session state and operating-system policy. A blocked physical-host check remains blocked; it is never promoted to `tested` by inference.

Provider endpoints and credentials remain user-supplied. Local fixture coverage proves protocol/runtime behaviour but does not certify every hosted provider implementation.

## Evidence interpretation

- `tested` means the exact surface has repository-verifiable evidence for the named combination;
- `experimental` means the architecture supports the path but evidence is incomplete or narrower;
- `unsupported` means the project does not currently claim that combination.

These labels do not create production certification or an SLA. Q1X Community Orchestrator remains licensed under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial use.
