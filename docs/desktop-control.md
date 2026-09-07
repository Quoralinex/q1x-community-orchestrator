---
layout: default
title: Desktop and application control
---

# Desktop and application control

Phase 6B adds provider-neutral desktop and application control for native GUI applications and operating-system windows outside the browser boundary delivered in Phase 6A.

Q1X owns the language-neutral endpoint/action contracts, persistence, security policy, capability registration, execution lifecycle and metadata-only audit records. Platform automation mechanics remain behind a pluggable backend interface.

## Why a bridge boundary

macOS Accessibility, Windows UI Automation and Linux AT-SPI are different native systems. Community core therefore does not pretend that one OS API is portable across all three platforms.

The built-in backend is `stdio-bridge`. It launches an explicitly configured local bridge process with `shell: false`, sends one versioned JSON request over stdin and reads one normalized JSON result from stdout. Optional native or application-specific bridges can implement the host automation mechanism without changing Q1X contracts.

No native desktop bridge binary is bundled with the Community runtime and no paid desktop-automation service is mandatory.

## Desktop endpoint

A persisted `DesktopEndpoint` declares the backend, target platform and bridge process configuration without persisting UI state or secrets.

```json
{
  "contractVersion": "1.0.0",
  "id": "desktop.portable-stdio",
  "name": "Portable desktop bridge",
  "backend": "stdio-bridge",
  "platform": "any",
  "transport": {
    "command": "q1x-desktop-bridge",
    "args": [],
    "timeoutMs": 30000,
    "maxOutputBytes": 4194304
  },
  "applicationPolicy": {
    "allowedApplications": ["example.app"]
  },
  "outputDir": "./desktop-output"
}
```

`platform` may be `macos`, `windows`, `linux` or `any`. Platform-specific endpoints are refused on incompatible hosts.

Environment mappings store only the bridge-visible variable name and the host environment key. Values are resolved at execution time and are not stored in endpoint configuration.

## Desktop actions

`DesktopActionBatch` contains ordered structured actions. Initial action families are:

- applications: `list-applications`, `launch-application`, `focus-application`, `close-application`;
- windows: `list-windows`, `focus-window`, `move-window`, `resize-window`;
- inspection: `inspect`, `find`;
- UI interaction: `click`, `double-click`, `hover`, `type`, `press`, `set-value`, `select`, `toggle`;
- pointer control: `mouse-move`, `mouse-down`, `mouse-up`, `wheel`, `drag`;
- timing and capture: `wait`, `screenshot`.

Targets use provider-neutral accessibility descriptions: accessibility id, role/name, accessible name, visible text or an accessibility path. Coordinate actions use explicit coordinates.

Example:

```json
{
  "contractVersion": "1.0.0",
  "id": "desktop.batch.example",
  "actions": [
    {
      "id": "focus",
      "kind": "focus-application",
      "application": "example.app"
    },
    {
      "id": "find-submit",
      "kind": "find",
      "target": {
        "by": "role",
        "role": "button",
        "name": "Continue"
      }
    }
  ]
}
```

## Bridge protocol

The built-in backend writes one envelope to stdin:

```json
{
  "protocol": "q1x-desktop-bridge/1",
  "endpoint": {
    "id": "desktop.portable-stdio",
    "platform": "any"
  },
  "batch": {
    "contractVersion": "1.0.0",
    "id": "desktop.batch.example",
    "actions": []
  }
}
```

A bridge returns a normalized `DesktopBatchResult`, optionally wrapped as `{ "ok": true, "result": ... }`. A controlled transport failure may return `{ "ok": false, "error": { ... } }`; Q1X exposes only a sanitized transport failure to the orchestration layer.

## Security boundary

Desktop control can expose sensitive local applications, so the built-in boundary is deliberately restrictive:

- commands and argv remain separate; no shell command strings are used;
- only minimal process variables plus explicitly mapped environment values are inherited;
- application allow/block policy is enforced before bridge invocation;
- screenshot output must remain beneath the endpoint `outputDir`;
- stdout/stderr are bounded;
- timeout and abort signals terminate the bridge process;
- bridge/application content is not copied into runtime audit events;
- credentials, clipboard data, typed text, accessibility trees and screenshots are not persisted by the desktop transport.

Phase 6B does not implement privilege escalation, security-control bypass, credential extraction, keylogging or covert monitoring.

## Capability discovery

`q1x desktop discover <endpoint-id>` registers a `desktop-control` capability. Availability requires both a registered backend and a compatible host platform.

The capability advertises application, window, inspection, keyboard, mouse and screenshot operations through the existing live capability registry.

## CLI

Persist an endpoint:

```bash
q1x --home .q1x desktop-endpoints put --file examples/desktop-endpoints/portable-stdio.endpoint.json
```

Discover capability:

```bash
q1x --home .q1x desktop discover desktop.portable-stdio
```

Execute a batch:

```bash
q1x --home .q1x desktop run desktop.portable-stdio --file examples/desktop-endpoints/example.desktop-batch.json
```

## Extending desktop control

`DesktopBackend` and `DesktopBackendRegistry` are the public runtime extension points. Optional packages can supply macOS Accessibility, Windows UI Automation, Linux AT-SPI, remote desktop, virtual desktop or application-specific bridges while preserving the same Q1X contracts and security envelope.
