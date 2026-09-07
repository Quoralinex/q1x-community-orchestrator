# Phase 6A Browser and Web Control Design

**Status:** Approved for implementation on 7 September 2026.

## Purpose

Phase 6A adds provider-neutral browser and web control to Q1X Community Orchestrator. The browser is a capability, not a model provider: the same execution layer can operate ordinary websites, web applications, authenticated web chats, portals and local web interfaces.

## Architectural boundary

The built-in backend is Playwright Core 1.63.0. Q1X owns endpoint contracts, session lifecycle, action normalization, security policy, capability registration and audit metadata. Playwright owns browser automation mechanics. A public `BrowserBackend` interface keeps native WebDriver, remote browser services and future platform-specific controllers pluggable without changing Q1X core.

Browser control is separate from desktop/application control. Phase 6B will handle arbitrary desktop GUI automation after the browser boundary is merged and stable.

## Browser endpoint

A normative `BrowserEndpoint` contract persists configuration but never live session material. It includes an id, name, backend, mode, engine, launch/connection settings, viewport, download directory, file-access roots, navigation policy and timeout settings.

Built-in modes are:

- `managed`: launch a Q1X-managed Playwright browser/context. Ephemeral context is the default. An explicit `userDataDir` enables a persistent local profile when the user chooses it.
- `cdp`: attach to an existing Chromium-family browser over the Chrome DevTools Protocol. This is the built-in route for reusing an already authenticated Chrome/Chromium/Edge/Opera-style session when the browser was explicitly launched with remote debugging.

Managed engines are `chromium`, `firefox` and `webkit` when their compatible browser binaries are installed. Playwright WebKit is not represented as native Safari. Native Safari control belongs in a future WebDriver backend rather than being falsely claimed by this backend.

## Session lifecycle

`BrowserSessionManager` owns live sessions in memory. It exposes `openSession(endpoint)`, `execute(sessionId, batch)` and `closeSession(sessionId)`. Session ids, browser contexts, cookies, local storage and CDP handles are not written to SQLite.

`OpenControlRuntime` exposes the same lifecycle for long-running hosts. The CLI remains process-scoped: `q1x browser run <endpoint> --file <batch>` opens, executes and closes in one process. Long-lived CLI sessions are deferred until Q1X has a daemon/service lifecycle.

## Browser actions

A normative `BrowserActionBatch` contains ordered actions and returns a normalized batch result. Initial actions are navigation (`navigate`, `back`, `forward`, `reload`), inspection (`inspect`, `extract`), DOM interaction (`click`, `double-click`, `hover`, `fill`, `type`, `press`, `select`, `check`, `uncheck`), mouse control (`mouse-move`, `mouse-down`, `mouse-up`, `wheel`, `drag`), timing (`wait`), files (`upload`, `download`) and capture (`screenshot`).

Targets use provider-neutral locator descriptions: CSS selector, visible text, role/name, label, placeholder or coordinates where an action is coordinate-based. Inspection never returns password-field values by default.

## Result model

Each action result records its action id, status, duration and non-secret output. Batch execution returns the final URL/title plus ordered action results. Screenshots and downloads are written only to explicit local output locations and return file metadata; raw browser session data is not persisted.

Runtime audit events contain endpoint id, backend, action count, status and duration only. Page text, form values, screenshots, downloads, cookies and browser storage are not copied into audit events.

## Security

Only `http:` and `https:` navigation is permitted by the built-in action layer. `file:`, `javascript:`, browser-internal and data URLs are rejected. Optional allowed-origin and blocked-origin policies are enforced before navigation.

Remote CDP endpoints require secure WebSocket/HTTPS transport; loopback HTTP/WebSocket is permitted for local control. Credentials may be referenced by environment key but never persisted as secret values. Redirects during explicit control-protocol connection are not used to move credentials to another host.

Uploads must resolve beneath an endpoint-configured file-access root. Downloads are written beneath the configured download directory. Persistent user-data directories are explicit opt-in configuration. Q1X does not extract passwords, cookies or authentication tokens from an attached browser session.

Phase 6A does not implement CAPTCHA bypass, anti-bot bypass, credential theft or hidden authentication workarounds.

## Browser compatibility

The core is OS-neutral. Playwright-managed Chromium works on macOS, Windows and Linux when the compatible browser is installed. Firefox and WebKit remain optional Playwright engines. Chromium-family existing sessions can use CDP. Browser-specific backends such as native Safari WebDriver are extensions behind `BrowserBackend` rather than special cases in the orchestrator.

## Testing

Tests use real local HTTP pages and a real browser. The gate covers navigation, inspection, forms, mouse/keyboard actions, upload, download, screenshot, timeout/cancellation, origin policy, session isolation, metadata-only auditing and CDP endpoint security. CI uses a real Chromium-compatible executable; tests do not mock the browser API.

## Distribution and licensing

The runtime depends on `playwright-core` exactly at 1.63.0; Q1X does not bundle browser binaries into the npm runtime package. Browser installation remains an explicit deployment concern. All repository packages continue to carry the repository's PolyForm Noncommercial License 1.0.0. No paid browser service is mandatory.

## Out of scope

Phase 6A does not implement arbitrary desktop GUI control, native Safari WebDriver, browser extensions, a persistent Q1X daemon, remote browser farms, physical devices, dynamic agent-team formation or adaptive programme scheduling. Those remain later delivery slices.
