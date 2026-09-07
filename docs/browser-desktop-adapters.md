# Browser/Web and Desktop/Application Adapters

Phase 6 adds browser/web control and desktop/application control to the executable adapter runtime while keeping Q1X provider-neutral and OS-neutral.

Built-in protocols are:

- `webdriver-http-v1` for standards-based W3C WebDriver browser control.
- `desktop-json-stdio-v1` for a neutral local desktop/application bridge.

Both reuse persisted `AdapterEndpoint` documents and the existing `ExecutionRequest` / `ExecutionResult` envelope. The existing `q1x adapter execute` and `q1x adapter discover` commands therefore work without a second orchestration surface.

## Browser control with WebDriver

A browser endpoint uses `adapterKind: browser-control`, protocol `webdriver-http-v1` and an HTTP transport pointing at a WebDriver server.

```json
{
  "contractVersion": "1.0.0",
  "id": "adapter.browser.webdriver-local",
  "name": "Local WebDriver browser control",
  "adapterKind": "browser-control",
  "protocol": "webdriver-http-v1",
  "transport": {
    "kind": "http",
    "url": "http://127.0.0.1:4444",
    "timeoutMs": 30000
  }
}
```

The core does not bundle or download a browser, browser driver or hosted browser service. Any conforming WebDriver implementation can sit behind this endpoint.

### Browser actions

`ExecutionRequest.input` is a structured action object. Supported actions include:

- session lifecycle: `status`, `newSession`, `deleteSession`;
- navigation: `navigate`, `currentUrl`, `back`, `forward`, `refresh`;
- inspection: `title`, `pageSource`, `findElement`, `findElements`, `activeElement`;
- element interaction: `click`, `sendKeys`, `elementText`, `elementAttribute`;
- scripts and capture: `executeScript`, `executeAsyncScript`, `screenshot`;
- windows: `windowHandles`, `switchWindow`, `closeWindow`, `getWindowRect`, `setWindowRect`, `maximizeWindow`, `minimizeWindow`, `fullscreenWindow`;
- frames: `switchFrame`, `switchParentFrame`;
- cookies: `getCookies`, `addCookie`, `deleteCookies`;
- input actions: `performActions`, `releaseActions`;
- timeouts: `getTimeouts`, `setTimeouts`;
- dialogs: `getAlertText`, `acceptAlert`, `dismissAlert`, `sendAlertText`.

Example session creation:

```json
{
  "action": "newSession",
  "capabilities": {
    "alwaysMatch": {
      "browserName": "firefox"
    }
  }
}
```

Example navigation:

```json
{
  "action": "navigate",
  "sessionId": "SESSION_ID",
  "url": "https://example.org/"
}
```

Example element interaction:

```json
{
  "action": "findElement",
  "sessionId": "SESSION_ID",
  "using": "css selector",
  "value": "button[type=submit]"
}
```

The returned WebDriver `value` is placed in `ExecutionResult.output`. WebDriver errors are normalized into failed execution results rather than copied into orchestration state as raw transport failures.

### Discovery

`q1x adapter discover <endpoint-id>` calls the WebDriver `/status` endpoint. A reachable endpoint registers a browser-control capability with the live capability registry and advertises the built-in action vocabulary.

## Desktop and application control

Desktop control uses `adapterKind: desktop-control` and protocol `desktop-json-stdio-v1`.

The orchestrator does not pretend that one native accessibility API works across macOS, Windows and Linux. Instead it defines a stable local bridge boundary. Optional bridge implementations can use the native accessibility or automation mechanism appropriate to their host while Q1X keeps one execution contract.

Example endpoint:

```json
{
  "contractVersion": "1.0.0",
  "id": "adapter.desktop.local-bridge",
  "name": "Local desktop accessibility bridge",
  "adapterKind": "desktop-control",
  "protocol": "desktop-json-stdio-v1",
  "transport": {
    "kind": "stdio",
    "command": "q1x-desktop-bridge",
    "args": [],
    "timeoutMs": 30000,
    "maxOutputBytes": 4194304,
    "inputMode": "json",
    "outputMode": "json"
  }
}
```

The process is spawned directly with explicit argv and no shell.

### Bridge request

For each execution the bridge receives one JSON document on stdin:

```json
{
  "protocol": "q1x-desktop-bridge/1",
  "requestId": "request.desktop.1",
  "workItemId": "work.desktop.1",
  "input": {
    "action": "focusApplication",
    "application": "example"
  }
}
```

A bridge may return its output directly as JSON, or use the explicit success form:

```json
{
  "ok": true,
  "output": {
    "windowId": "window-1"
  }
}
```

A controlled failure uses:

```json
{
  "ok": false,
  "error": {
    "code": "ELEMENT_NOT_FOUND",
    "message": "The requested element was not found",
    "retryable": false
  }
}
```

The bridge action vocabulary is intentionally extensible. Typical bridge implementations can provide application launch/focus/close, window enumeration/focus/move/resize, accessibility-tree inspection, element find/click/type/select, keyboard shortcuts, pointer actions and screenshots.

## Why the desktop bridge is neutral

Native automation differs materially by platform. A bridge can be implemented with macOS Accessibility APIs, Windows UI Automation, Linux AT-SPI or another local mechanism without placing any of those technologies inside the Community core.

This also permits application-specific adapters, remote-desktop bridges, virtual desktop environments and future mobile/device transports to use the same Q1X execution boundary.

## Security

Browser and desktop control can expose sensitive user interfaces and data, so the Phase 6 boundary keeps the existing strict execution rules:

- remote WebDriver HTTP endpoints require HTTPS;
- loopback HTTP is allowed for locally hosted WebDriver services;
- usernames and passwords may not be embedded in endpoint URLs;
- sensitive HTTP credentials use environment references, not stored values;
- redirects are not followed automatically;
- desktop processes use direct executable invocation, never shell command strings;
- only explicitly mapped environment values plus the minimal process environment are inherited;
- desktop stdout/stderr are bounded and execution is terminated on timeout or cancellation;
- request input and returned page/application content are not copied into runtime audit events.

Screenshots, page source, cookies, accessibility trees and application data remain execution results only unless a higher orchestration layer deliberately promotes them into an artifact or evidence record.

## CLI

Register endpoints using the existing endpoint CLI:

```bash
node packages/runtime/dist/cli.js --home .q1x adapter-endpoints put \
  --file examples/adapter-endpoints/webdriver-local.endpoint.json

node packages/runtime/dist/cli.js --home .q1x adapter-endpoints put \
  --file examples/adapter-endpoints/desktop-bridge.endpoint.json
```

Discover browser capability:

```bash
node packages/runtime/dist/cli.js --home .q1x adapter discover adapter.browser.webdriver-local
```

Execute browser or desktop work using the same generic execution command:

```bash
node packages/runtime/dist/cli.js --home .q1x adapter execute adapter.browser.webdriver-local \
  --file path/to/execution-request.json
```

## Extensibility

`AdapterTransportRegistry` remains the extension point. Optional packages may add WebDriver BiDi, Chrome DevTools Protocol, native accessibility transports, mobile automation, RDP/VNC control or application-specific protocols without introducing provider switches into the runtime.
