---
layout: default
title: Desktop and application control
---

# Desktop and application control

Phase 6B adds OS-neutral desktop and native-application control as a first-class Q1X capability. The public contracts do not depend on one operating system, application vendor, model provider or paid automation service.

## Common endpoint model

A `DesktopEndpoint` declares a backend, supported platforms, an explicit application allowlist, optional screenshot output root, timeout and policy flags. Applications are addressed through platform-specific selectors stored as data rather than shell fragments.

Built-in selector kinds are:

- macOS: bundle id or application name;
- Windows: AppUserModelId, process name or absolute executable path;
- Linux: desktop id, process name or command.

Actions can target only applications in the endpoint allowlist.

## Normalized desktop actions

The v1 action surface covers launch, activate, quit, inspect, typing, key presses, hotkeys, coordinate mouse actions, wheel, drag, waits and screenshots. Backends return normalized success, partial, failed or cancelled results and must report unsupported operations honestly.
## Platform backends

**macOS native** uses direct `/usr/bin/open`, `/usr/bin/osascript` and `/usr/sbin/screencapture` processes. Richer mouse primitives use `cliclick` only when it is installed. Accessibility and Screen Recording remain normal macOS permissions controlled by the user.

**Windows native** uses direct PowerShell process execution with fixed internal scripts and Windows APIs. Request values are passed as argv data; Q1X does not evaluate user-supplied PowerShell source.

**Linux X11** uses direct `xdotool` commands when an X11 display is available. Screenshot support is enabled when `gnome-screenshot`, `scrot` or ImageMagick `import` is available. Wayland-only sessions are reported as unsupported rather than pretending X11 automation works.

## Security boundary

Desktop control does not provide arbitrary shell execution. Native processes are spawned with `shell: false`, application control is allowlisted, and Windows executable selectors must be absolute.

Endpoint policy can independently disable application launch, quit, input or capture. Screenshot output is constrained to `screenshotDir`. Live desktop sessions, typed text, inspected UI content and screenshot bytes are not copied into SQLite audit events.

Audit records contain only control metadata such as endpoint, backend, action count, status and duration. Missing OS permissions or optional tools are exposed as availability/operation limitations rather than bypassed.

## CLI

Persist and discover a desktop endpoint:

```bash
q1x --home .q1x desktop-endpoints put --file examples/desktop-endpoints/macos-native.endpoint.json
q1x --home .q1x desktop discover desktop.macos-native
```
Run a one-shot action batch:

```bash
q1x --home .q1x desktop run desktop.macos-native --file examples/desktop-endpoints/example.desktop-batch.json
```

Separate CLI invocations do not pretend to share an in-memory desktop session. Long-lived sessions are available through the runtime/SDK for daemon or application hosts.

## Extending desktop control

`DesktopBackend` and `DesktopBackendRegistry` separate Q1X action/session semantics from the built-in native implementations. Community packages can add richer accessibility, Wayland, remote-desktop or application-specific backends without changing the public orchestration contracts.

The repository remains licensed under the PolyForm Noncommercial License 1.0.0 for permitted non-commercial use; commercial exploitation requires a separate Quoralinex commercial licence.
