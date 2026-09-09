---
layout: default
title: Browser and web control
---

# Browser and web control

Phase 6A adds real browser control as a first-class Q1X capability. It is intended for ordinary websites, authenticated web applications, browser-hosted AI chats, portals and local web interfaces. Browser control is not tied to a model provider.

## Two session modes

**Managed sessions** launch a Q1X-managed Playwright browser context. Ephemeral contexts are the default and do not share cookies or cache with another session. An explicit `userDataDir` opts into a persistent local profile.

**CDP sessions** attach to an already-running Chromium-family browser over Chrome DevTools Protocol. This allows a user to reuse an existing authenticated browser session when that browser was explicitly launched with remote debugging enabled. Q1X disconnects from the session when finished; it does not terminate the user's browser.

The built-in backend uses `playwright-core` 1.63.0. It does not bundle a browser binary or require a paid remote-browser service. Compatible browsers must already be installed or supplied through endpoint configuration.

## Phase 12 browser starter profiles

Phase 12 adds built-in connector profiles for a managed Chromium-family browser and explicit Chromium CDP attachment. A supported browser remains an operator prerequisite; Q1X does not silently install one.

```bash
q1x --home .q1x connectors add browser.chromium.managed
q1x --home .q1x connectors configure browser.chromium.managed --parameter headless=true
q1x --home .q1x connectors test browser.chromium.managed
q1x --home .q1x connectors enable browser.chromium.managed
q1x --home .q1x connectors apply browser.chromium.managed
```

The tested Phase 12 claim is scoped to the managed Chromium-family runner configuration and the cited CDP/runtime tests, not every browser/version/OS combination.

## Browser actions

The initial normalized action surface supports navigation, back/forward/reload, DOM inspection and extraction, click/double-click/hover, form filling, sequential typing, key presses, select/check/uncheck, coordinate mouse move/down/up, wheel, drag-and-drop, waits, bounded file upload/download and screenshots.

Targets are provider-neutral locator descriptions: CSS selector, visible text, role/name, label or placeholder. Coordinate actions use explicit x/y values. Inspection does not expose password-field values.

## Security boundary

Only HTTP and HTTPS page navigation is accepted. `file:`, `javascript:`, `data:` and browser-internal navigation schemes are rejected. Endpoints can define allowed and blocked origins; configured redirect chains are preflighted before browser navigation so a blocked redirect target is not requested by the browser.

Remote CDP control requires HTTPS/WSS. Loopback HTTP/WebSocket is permitted for local browser control. Credentials must not be embedded in CDP URLs.

Uploads are limited to configured `fileAccessRoots`. Downloads and screenshots are limited to a configured `downloadDir`. Q1X does not persist browser cookies, local/session storage, passwords, CDP session material or browser authentication tokens.

Audit records contain metadata such as endpoint id, backend, action count, result status and duration. Page text, form input, screenshots, downloads and extracted content are not copied into runtime audit events.

## CLI

Persist a browser endpoint:

```bash
q1x --home .q1x browser-endpoints put --file examples/browser-endpoints/managed-chromium.endpoint.json
```

Discover its browser-control capability:

```bash
q1x --home .q1x browser discover browser.managed-chromium
```

Run a one-shot action batch:

```bash
q1x --home .q1x browser run browser.managed-chromium --file examples/browser-endpoints/example.browser-batch.json
```

The CLI intentionally does not pretend to maintain an in-memory session across separate process invocations. Long-lived sessions are available through the runtime/SDK. A future daemon can expose persistent CLI-managed sessions safely.

## Browser compatibility

The core remains OS-neutral. Phase 12's ready-to-use and compatibility-evidenced baseline is Chromium-family browser control: managed Chromium and explicit CDP attachment. The backend architecture can support additional browser engines where compatible binaries/backends are supplied, but Firefox, WebKit/native Safari and uncited browser/version/OS combinations are not Phase 12 compatibility claims.

## Extending the backend

`BrowserBackend` and `BrowserBackendRegistry` separate Q1X session/action semantics from Playwright. Community adapters can therefore add WebDriver, remote-browser or platform-specific backends without changing the orchestration contracts.
