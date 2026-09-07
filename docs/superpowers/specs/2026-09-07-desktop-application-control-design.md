# Phase 6B Desktop and Application Control Design

**Status:** Approved roadmap continuation following Phase 6A
**Date:** 7 September 2026

## Purpose

Phase 6B adds provider-neutral, OS-neutral desktop and application control to Q1X Community Orchestrator. It covers arbitrary native GUI applications and operating-system windows that are outside the browser boundary delivered in Phase 6A.

The Community core must not pretend that macOS Accessibility, Windows UI Automation and Linux AT-SPI are one native API. Q1X therefore owns the language-neutral desktop contracts, security policy, endpoint persistence, capability registration, execution lifecycle and audit metadata, while pluggable desktop backends own platform automation mechanics.

## Architectural boundary

The built-in backend is `stdio-bridge`. It launches an explicitly configured local bridge process directly with `shell: false`, sends one versioned JSON request over stdin and receives one normalized JSON result over stdout. Optional bridge packages can implement macOS Accessibility, Windows UI Automation, Linux AT-SPI, remote/virtual desktops or application-specific automation without changing Q1X core.

No bridge binary is bundled by the Community runtime. This preserves a zero-provider-fee core and prevents an OS-specific native dependency from becoming mandatory for every installation.

## Desktop endpoint

A normative `DesktopEndpoint` persists configuration but no live application state, credentials or UI content. It includes:

- id, name and backend id;
- target platform (`macos`, `windows`, `linux` or `any`);
- direct executable command and argument array for the bridge;
- optional working directory;
- timeout and bounded-output limits;
- explicit environment-variable mappings by host key name;
- application allow/block policy;
- screenshot/output directory and optional file-access roots;
- non-secret metadata.

Secret values are never stored in endpoint JSON. Environment mappings store only the bridge-visible variable name and the host environment key to resolve at execution time.

## Action contract

A normative `DesktopActionBatch` contains ordered actions and returns a normalized `DesktopBatchResult`.

Initial action families are:

- applications: `list-applications`, `launch-application`, `focus-application`, `close-application`;
- windows: `list-windows`, `focus-window`, `move-window`, `resize-window`;
- inspection: `inspect`, `find`;
- UI interaction: `click`, `double-click`, `hover`, `type`, `press`, `set-value`, `select`, `toggle`;
- pointer control: `mouse-move`, `mouse-down`, `mouse-up`, `wheel`, `drag`;
- timing/capture: `wait`, `screenshot`.

Targets are provider-neutral accessibility descriptions:

- accessibility id;
- role and optional accessible name;
- accessible name;
- visible text;
- hierarchical accessibility path.

Coordinate actions use explicit x/y values rather than inventing a fake accessibility target.

Application actions use an `application` identifier interpreted by the backend, for example a macOS bundle id, Windows executable/application id or Linux desktop/application id. Q1X treats this as an opaque identifier and applies endpoint allow/block policy before invoking the backend.

## Built-in stdio bridge protocol

For each batch the backend starts the configured bridge directly and writes one JSON document:

```json
{
  "protocol": "q1x-desktop-bridge/1",
  "endpoint": {
    "id": "desktop.local",
    "platform": "macos"
  },
  "batch": {
    "contractVersion": "1.0.0",
    "id": "desktop.batch.1",
    "actions": []
  }
}
```

The bridge returns a normalized desktop batch result. A transport-level controlled failure may instead return:

```json
{
  "ok": false,
  "error": {
    "code": "BRIDGE_ERROR",
    "message": "Sanitized bridge failure",
    "retryable": false
  }
}
```

A success wrapper `{ "ok": true, "result": { ... } }` is also accepted. stdout and stderr are bounded. Timeouts or abort signals terminate the bridge process.

## Result model

Each action result records action id, status, duration and optional non-secret output/error. The batch result records overall status, ordered action results and timestamps.

Raw desktop state is not persisted. Screenshots are written only beneath an explicitly configured output directory. Accessibility trees, text entered into applications, window contents and screenshots are not copied into runtime audit events.

## Security

- No shell command strings are supported; command and argv remain distinct.
- Only minimal process variables plus explicitly mapped environment values are inherited by the bridge.
- Endpoint configuration may not contain secret values by design; environment mappings carry key names only.
- Application allow/block policy is enforced in Q1X before bridge invocation.
- Screenshot output paths must resolve beneath the configured output directory.
- Optional file paths supplied by future bridge actions must resolve beneath configured file-access roots.
- Output capture is bounded and bridge execution is time limited/cancellable.
- Runtime audit events contain endpoint id, backend, platform, action count, status, duration and sanitized error code only.
- Password values, clipboard contents, accessibility trees, typed text, screenshots and application content are not persisted by the desktop transport.

Phase 6B does not implement privilege escalation, security-control bypass, credential extraction, keylogging or covert monitoring.

## Portability

The Q1X contracts and runtime are identical on macOS, Windows and Linux. Native bridge implementations are optional packages. A host may also supply an application-specific or remote-desktop bridge if it implements `q1x-desktop-bridge/1`.

The built-in backend reports a configured endpoint as available when the endpoint platform matches the host (or is `any`) and the backend is registered. Future native bridge packages may add richer probing without changing the contract.

## CLI

The public CLI adds:

- `q1x desktop-endpoints put/list/get`;
- `q1x desktop run <endpoint> --file <batch>`;
- `q1x desktop discover <endpoint>`.

CLI execution is one-shot. Desktop state remains owned by the operating system and applications, so a Q1X in-memory session abstraction is not required for this phase.

## Testing

Tests use a portable Node bridge fixture. The gate covers:

- contract/schema and TypeScript compatibility;
- endpoint persistence and platform/application/output-path policy;
- direct no-shell child-process execution;
- environment allowlisting;
- success and controlled bridge failures;
- timeout, cancellation and output limits;
- capability discovery;
- CLI round trips;
- metadata-only audit events;
- full repository, package, licence and security checks.

## Distribution and licensing

Phase 6B adds no mandatory runtime dependency. All public packages continue to carry PolyForm Noncommercial License 1.0.0. Commercial exploitation remains subject to separate Quoralinex commercial licensing.

## Out of scope

Phase 6B does not bundle native macOS/Windows/Linux bridge executables, control physical devices, implement browser control already delivered in Phase 6A, form dynamic agent teams, add deployment packaging or complete the later approval/evidence hardening phase.
