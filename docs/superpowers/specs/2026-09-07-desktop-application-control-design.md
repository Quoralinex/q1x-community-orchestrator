# Phase 6B Desktop/Application Control Design

**Date:** 2026-09-07  
**Status:** Approved roadmap implementation  
**Repository:** `Quoralinex/q1x-community-orchestrator`  
**Licence:** PolyForm Noncommercial License 1.0.0

## 1. Objective

Phase 6B adds provider-neutral desktop and native application control to the Community Orchestrator without coupling the core runtime to one operating system, application vendor, paid automation service, or private Q1X component.

The public runtime must be able to represent, discover and execute desktop capabilities on macOS, Windows and Linux through a common contract. Built-in platform backends provide practical local control where the host OS exposes suitable native tooling, while the backend registry remains open so community packages can add richer accessibility or application-specific integrations later.

## 2. Scope

Phase 6B delivers:

- normative `DesktopEndpoint` and `DesktopActionBatch` contracts;
- application allowlists with platform-specific selectors;
- memory-only desktop sessions;
- a pluggable `DesktopBackend` and backend registry;
- application launch, activation, quit and inspection;
- keyboard, hotkey, mouse, wheel and drag primitives;
- bounded screenshots;
- metadata-only runtime audit events;
- capability discovery into the existing live registry;
- one-shot desktop CLI commands;
- macOS native backend exercised on the current development host;
- Windows PowerShell backend implemented behind the same interface;
- Linux X11 backend implemented with optional `xdotool`/screenshot tooling;
- explicit backend availability/permission reporting.

Phase 6B does not perform OCR, image recognition, clipboard extraction, password-field extraction, arbitrary shell evaluation, remote-desktop tunnelling, mobile-device automation, or physical-device control. Those remain separate capabilities/adapters.

## 3. Architectural boundary

Desktop control is a peer capability to browser control, MCP, A2A, CLI/TUI and model transport. It does not bypass the Open Control Runtime.

```text
DesktopEndpoint -> DesktopSessionManager -> DesktopBackendRegistry
                                      |-> macos-native
                                      |-> windows-native
                                      |-> linux-x11
                                      `-> community/private backend
```

The runtime persists endpoint configuration and capability metadata only. Live UI sessions, accessibility trees, screenshots, keystrokes, action payloads and application content are not copied into SQLite by default.

## 4. Desktop endpoint contract

A `DesktopEndpoint` has:

- `contractVersion`, `id`, `name`;
- `backend`: opaque backend identifier;
- `platforms`: one or more of `macos`, `windows`, `linux`;
- `allowedApplications`: explicit application definitions;
- `screenshotDir`: optional bounded output root;
- `timeoutMs`;
- `policy`: optional booleans controlling launch, quit, input and capture;
- `metadata`.

Each allowed application contains a stable Q1X-local `id`, display name and one or more platform selectors. Selectors are data, never shell fragments:

- macOS: `bundle-id` or `application-name`;
- Windows: `app-user-model-id`, `process-name` or `executable-path`;
- Linux: `desktop-id`, `process-name` or `command`.

An action can reference only an application declared in the endpoint allowlist.

## 5. Action model

`DesktopActionBatch` contains ordered actions and optional `stopOnError`/timeout policy. Initial action kinds are:

- `launch`, `activate`, `quit`, `inspect`;
- `click`, `double-click`, `mouse-move`, `mouse-down`, `mouse-up`, `wheel`, `drag`;
- `type`, `press`, `hotkey`;
- `wait`, `screenshot`.

Targets are intentionally generic:

- `application` by allowlisted application id;
- `coordinates` by desktop coordinates;
- `window` by application id and/or title;
- `accessibility` by optional role/name/identifier plus application id.

A backend may return `UNSUPPORTED_OPERATION` when the host cannot support a target/action safely. The common API must not fabricate success.

## 6. Platform backends

### 6.1 macOS native

The built-in `macos-native` backend uses direct process spawning only:

- `/usr/bin/open` for allowlisted application launch;
- `/usr/bin/osascript`/System Events for activation, quit, keyboard and accessibility-oriented inspection/control;
- `/usr/sbin/screencapture` for bounded screenshots;
- optional `cliclick` for richer mouse move/down/up/drag/wheel primitives when installed.

Accessibility and Screen Recording permissions remain user-controlled OS permissions. The runtime reports missing permissions/dependencies; it never attempts to bypass them.

### 6.2 Windows native

The built-in `windows-native` backend invokes PowerShell directly with fixed internal scripts, not a shell command assembled from user input. It uses Windows process APIs/User32/SendInput-style operations for launch, foreground-window control, input and capture. Only allowlisted application selectors become script data.

### 6.3 Linux X11

The built-in `linux-x11` backend uses direct `xdotool` invocation for window/input primitives when available and an available screenshot utility for capture. Wayland-only sessions are reported as unavailable/limited rather than silently pretending X11 control works.

## 7. Security model

- Application launch/control requires an explicit endpoint allowlist.
- Arbitrary shell strings are never executed.
- Executable paths must be absolute when used as selectors.
- Screenshot paths must remain within `screenshotDir`.
- Desktop sessions are in memory only.
- Action payloads, typed text and screen content are not persisted in audit events.
- Audit records contain endpoint id, backend, action count, result status, duration and normalized error code only.
- Backend discovery reports missing permissions/dependencies without leaking host secrets.
- Platform backends must use direct argv/process APIs rather than `shell: true`.

## 8. Runtime API

`OpenControlRuntime` adds:

- `putDesktopEndpoint`, `getDesktopEndpoint`, `listDesktopEndpoints`;
- `registerDesktopBackend`;
- `openDesktopSession`, `executeDesktopSession`, `closeDesktopSession`;
- `runDesktopBatch`;
- `discoverDesktopCapability`.

Capability records use `adapterKind: "desktop-control"`, report the backend-supported operation set, host platform, local execution/privacy semantics and no-usage-fee cost class.

## 9. CLI

Because the CLI is process-scoped, public commands are one-shot:

```text
q1x desktop-endpoints put <file>
q1x desktop-endpoints list
q1x desktop-endpoints get <id>
q1x desktop discover <endpoint-id>
q1x desktop run <endpoint-id> --file <batch.json>
```

Long-lived desktop sessions remain an SDK/runtime API for daemon or application hosts.

## 10. Testing

The release gate includes:

- strict JSON Schema and SDK type tests;
- endpoint security/allowlist tests;
- backend/session-manager tests;
- real macOS read-only/lifecycle smoke tests where permissions permit;
- deterministic Windows/Linux command-construction tests on non-target hosts;
- action normalization, cancellation, timeout and audit tests;
- screenshot path-boundary tests;
- CLI end-to-end tests through a deterministic test backend;
- clean install/build/test/audit/package verification;
- PolyForm Noncommercial licence propagation checks;
- public/private boundary scan and full-SHA GitHub Action verification.

## 11. Completion criteria

Phase 6B is complete when the public contracts, runtime, three platform backend implementations, CLI, documentation and examples are merged through the protected repository checks; the merged `main` test suite, CodeQL and Pages deployment pass; and no private Q1X governance/tooling is introduced.
