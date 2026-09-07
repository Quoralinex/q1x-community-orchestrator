# Phase 6 Browser/Web and Desktop/Application Adapter Design

**Status:** Approved roadmap implementation
**Date:** 7 September 2026

## Objective

Add executable browser/web control and desktop/application control to the existing provider-neutral adapter runtime without making any browser vendor, operating system, paid API, hosted automation service or proprietary desktop framework mandatory.

Phase 6 reuses the existing `AdapterEndpoint`, `ExecutionRequest`, `ExecutionResult`, capability registry and `AdapterTransportRegistry`. It extends the executable adapter family rather than adding another orchestration layer.

## Design principles

- Standards first: browser control uses the W3C WebDriver HTTP model.
- Cross-platform desktop control uses a neutral JSON bridge contract over explicit subprocess stdio.
- Browser and desktop actions are structured data, never shell command strings.
- Existing HTTPS/loopback HTTP and credential-reference security rules remain in force.
- Desktop bridge subprocesses use the same explicit command/argv and environment allowlisting boundary as CLI adapters.
- Request input, page content, screenshots, UI trees and returned application data are not copied into runtime audit events.
- The transport registry remains open to CDP, WebDriver BiDi, native accessibility, mobile/device and vendor-specific transports as optional extensions.

## Endpoint contract

`AdapterEndpoint.adapterKind` is extended with the already-defined public taxonomy values:

- `browser-control`
- `desktop-control`

No new orchestration document is required. The existing HTTP and stdio transport shapes remain sufficient for the built-in Phase 6 protocols.

Built-in protocol ids are:

- `webdriver-http-v1`
- `desktop-json-stdio-v1`

Browser endpoints use an HTTP transport whose URL is the WebDriver server base URL. Desktop endpoints use an explicit stdio command, argument array, working directory, timeout/output limits and optional allowlisted environment mappings.

## Browser/WebDriver transport

The WebDriver transport accepts an object in `ExecutionRequest.input` with an `action` field and action-specific arguments. Initial actions cover the main W3C automation lifecycle:

- `status`
- `newSession`
- `deleteSession`
- `navigate`
- `currentUrl`
- `title`
- `pageSource`
- `findElement`
- `findElements`
- `activeElement`
- `click`
- `sendKeys`
- `elementText`
- `elementAttribute`
- `screenshot`
- `executeScript`
- `back`
- `forward`
- `refresh`
- `windowHandles`
- `switchWindow`
- `closeWindow`
- `getCookies`
- `addCookie`
- `deleteCookies`
- `performActions`
- `releaseActions`

The transport converts these structured actions into WebDriver HTTP requests, returns the WebDriver `value` payload through `ExecutionResult.output`, bounds request duration, disables automatic redirects and sanitizes transport failures.

`discover()` calls the WebDriver `/status` endpoint and registers one general browser-control capability for the endpoint when it is reachable.

## Desktop bridge transport

Desktop control is intentionally not tied to AppleScript, macOS Accessibility, Windows UI Automation, AT-SPI, xdotool, Java Access Bridge or another operating-system API in core.

Instead, `desktop-json-stdio-v1` launches a configured local bridge directly with `shell: false` semantics and writes one JSON request to stdin. The bridge receives:

```json
{
  "protocol": "q1x-desktop-bridge/1",
  "requestId": "...",
  "workItemId": "...",
  "input": { "action": "..." }
}
```

It returns one JSON object. A successful response may be either the raw output object or `{ "ok": true, "output": ... }`. A bridge failure may return `{ "ok": false, "error": { "code": "...", "message": "...", "retryable": false } }`.

This lets optional bridges implement native macOS, Windows, Linux, remote-desktop, virtual-desktop or application-specific accessibility control without changing the orchestrator core.

Initial documented desktop action vocabulary includes application launch/focus/close, window listing/focus/move/resize, UI-tree inspection, element find/click/type/value selection, keyboard shortcuts, pointer actions and screenshots. Core treats the action body as extensible structured data rather than freezing an OS-specific schema.

## Security

- Remote browser HTTP endpoints require HTTPS; loopback HTTP is allowed for local WebDriver services.
- Credentials are injected only from configured environment references.
- Redirects are not followed automatically.
- Browser endpoint URLs may not embed usernames/passwords.
- Desktop bridge commands are spawned directly with explicit argv and no shell.
- Only configured environment values plus the minimal executable environment are inherited.
- stdout/stderr are bounded; timeouts and cancellation terminate the bridge process.
- Runtime audit events continue to record endpoint/protocol/status/duration only.
- Page source, cookies, screenshots, element values, UI trees and desktop bridge output are not persisted by the transport layer.

## Portability and extension

WebDriver gives one browser-control baseline across Chromium, Firefox, Safari and other conforming implementations when their driver/server is available. The core does not bundle or download a browser driver.

Desktop portability is achieved through a stable bridge boundary rather than pretending one native accessibility API works on every operating system. Optional community adapters can provide native bridges for macOS, Windows and Linux while preserving the same Q1X execution envelope.

Future transports may add WebDriver BiDi, CDP, mobile automation, RDP/VNC control, direct accessibility APIs or long-lived desktop sessions through `AdapterTransportRegistry` without changing mission/programme/runtime contracts.

## Testing

Browser tests use a local loopback synthetic WebDriver server and verify request mapping, response normalization, discovery, timeout/security behaviour and representative browser actions.

Desktop tests use a portable Node child-process bridge fixture and verify direct no-shell execution, JSON request/response normalization, failure propagation, output limits and timeout behaviour.

Acceptance requires the complete repository suite, strict TypeScript compilation, package dry-runs, zero high-severity npm audit findings, public/private boundary scan, SHA-pinned GitHub Actions and protected PR checks.

## Out of scope for Phase 6

Dynamic team formation and adaptive programme supervision remain Phase 7. Cross-platform installers/containers remain Phase 8. Approval/evidence/audit hardening remains Phase 9. Native OS-specific desktop bridges may be delivered as later optional adapter packages without weakening the provider-neutral Community core.
