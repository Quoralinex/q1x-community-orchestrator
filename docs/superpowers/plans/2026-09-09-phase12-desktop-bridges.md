# Phase 12 First-Party Desktop Bridges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ready-to-run first-party desktop bridge packages for macOS, Windows and Linux behind the existing `q1x-desktop-bridge/1` stdio contract.

**Architecture:** Keep `packages/runtime/src/stdio-desktop.ts` unchanged as the transport/security boundary. Add three workspace packages whose executable entrypoints read one JSON envelope from stdin, validate platform/protocol, execute native accessibility/window operations through platform-native facilities, and write one normalized JSON result to stdout. Each bridge also exposes a `--doctor` mode for non-destructive preflight.

**Tech Stack:** Node.js 24 ESM, macOS `osascript`/System Events accessibility, Windows PowerShell/.NET UI Automation, Linux Python 3 + GI/AT-SPI when available, Node test runner, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-09-core-usability-ecosystem-design.md`

## Global Constraints

- Node.js `>=24`.
- Existing desktop bridge protocol remains exactly `q1x-desktop-bridge/1`.
- No shell-string execution; commands and argv stay separate.
- No privilege escalation or privacy-control bypass.
- No secret persistence.
- Public package licence remains PolyForm Noncommercial License 1.0.0.
- Bridge output is bounded and normalized; UI content is not copied into audit logs.
- Physical-host permission restrictions must be reported as diagnostics, not hidden by a success result.

---

### Task 1: Shared desktop-bridge protocol helpers

**Files:**
- Create: `packages/desktop-bridge-common/package.json`
- Create: `packages/desktop-bridge-common/tsconfig.json`
- Create: `packages/desktop-bridge-common/LICENSE`
- Create: `packages/desktop-bridge-common/src/index.ts`
- Create: `packages/desktop-bridge-common/src/protocol.ts`
- Create: `packages/desktop-bridge-common/src/io.ts`
- Create: `tests/desktop-bridge-common.test.mjs`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`
- Modify: `package.json`

**Interfaces:**
- Produces `readBridgeEnvelope()`, `writeBridgeSuccess()`, `writeBridgeFailure()`, `validateBridgeEnvelope()`, `BridgeDoctorResult`, `DesktopBridgeEnvelope`.
- Consumes public desktop contract types from `@quoralinex/q1x-community-sdk`.

- [ ] **Step 1: Write the failing protocol tests**

Assert that valid `q1x-desktop-bridge/1` envelopes parse, invalid protocol/action shapes fail closed, stdin is size bounded, and normalized failure output contains only code/message/details permitted by the helper.

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test tests/desktop-bridge-common.test.mjs` and require failure because the package/helper does not yet exist.

- [ ] **Step 3: Implement the common package**

Implement strict envelope parsing and JSON stdin/stdout helpers with a 4 MiB default input/output ceiling. No helper may spawn a process or know a platform API.

- [ ] **Step 4: Wire workspace build/test and regenerate the lockfile**

Add the package as a TypeScript project reference and add the focused test to the root test surface. Regenerate package-lock through npm, never by bypassing `npm ci`.

- [ ] **Step 5: Verify GREEN and commit**

Run build, focused test, distribution/licence checks and `npm ci` in CI.

---

### Task 2: macOS first-party Accessibility bridge

**Files:**
- Create: `packages/desktop-bridge-macos/package.json`
- Create: `packages/desktop-bridge-macos/tsconfig.json`
- Create: `packages/desktop-bridge-macos/LICENSE`
- Create: `packages/desktop-bridge-macos/README.md`
- Create: `packages/desktop-bridge-macos/src/index.ts`
- Create: `packages/desktop-bridge-macos/src/macos.ts`
- Create: `packages/desktop-bridge-macos/src/jxa.ts`
- Create: `tests/desktop-bridge-macos.test.mjs`
- Create: `examples/desktop-endpoints/macos-first-party.endpoint.json`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

**Interfaces:**
- Executable bin `q1x-desktop-bridge-macos`.
- `--doctor --json` returns `{ platform:'macos', state, checks:[...] }`.
- stdin execution consumes `q1x-desktop-bridge/1` and emits normalized `DesktopBatchResult`.

- [ ] **Step 1: Add RED tests**

Tests cover non-macOS refusal, doctor JSON shape, permission-denied normalization, deterministic JXA request construction, action/result correlation and supported-action advertisement.

- [ ] **Step 2: Implement JXA/System Events backend**

Spawn `/usr/bin/osascript` directly with `['-l','JavaScript','-e', script]`. The generated script uses System Events/application processes for application/window enumeration, accessibility element search and supported actions. The Node side never concatenates untrusted values into executable command strings; structured request data is passed as JSON argument/input to a fixed script body.

- [ ] **Step 3: Implement doctor checks**

Check `process.platform === 'darwin'`, `osascript` existence and a non-destructive System Events accessibility probe. Return `blocked` with remediation to grant Accessibility permission when denied.

- [ ] **Step 4: Package and endpoint profile**

Expose executable bin, exact package version line, PolyForm licence and a ready endpoint example using the package executable.

- [ ] **Step 5: Verify on macOS CI and commit**

Hosted CI must execute doctor and a deterministic harness. Physical Accessibility interaction remains separately labelled until tested on an authorized host.

---

### Task 3: Windows first-party UI Automation bridge

**Files:**
- Create: `packages/desktop-bridge-windows/package.json`
- Create: `packages/desktop-bridge-windows/tsconfig.json`
- Create: `packages/desktop-bridge-windows/LICENSE`
- Create: `packages/desktop-bridge-windows/README.md`
- Create: `packages/desktop-bridge-windows/src/index.ts`
- Create: `packages/desktop-bridge-windows/src/windows.ts`
- Create: `packages/desktop-bridge-windows/src/powershell.ts`
- Create: `tests/desktop-bridge-windows.test.mjs`
- Create: `examples/desktop-endpoints/windows-first-party.endpoint.json`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

**Interfaces:**
- Executable bin `q1x-desktop-bridge-windows`.
- Uses direct `powershell.exe`/`pwsh.exe` process invocation, never a shell command string.

- [ ] **Step 1: Add RED tests**

Cover platform refusal, PowerShell discovery, doctor shape, UIAutomation assembly/script generation, unsupported/elevated-target normalization, result correlation and no automatic elevation flags.

- [ ] **Step 2: Implement fixed PowerShell worker**

Load `.NET` UIAutomation assemblies and implement application/window enumeration, AutomationElement find, Invoke/Value/Selection/Toggle patterns where available, keyboard/pointer operations through safe OS APIs and screenshot support through .NET drawing APIs. Structured request JSON is passed through stdin/encoded data to a fixed script body rather than interpolated into commands.

- [ ] **Step 3: Implement doctor**

Verify Windows platform, PowerShell executable and UIAutomation assembly availability. Report `blocked`/`unsupported` with exact remediation rather than requesting elevation.

- [ ] **Step 4: Package/profile and verify on Windows CI**

Use a deterministic test target available on the runner or a packaged test window fixture. Verify the bridge executable actually runs through the existing runtime stdio backend.

- [ ] **Step 5: Commit**

Require build/tests/package dry-run and no shell invocation regression.

---

### Task 4: Linux first-party AT-SPI bridge

**Files:**
- Create: `packages/desktop-bridge-linux/package.json`
- Create: `packages/desktop-bridge-linux/tsconfig.json`
- Create: `packages/desktop-bridge-linux/LICENSE`
- Create: `packages/desktop-bridge-linux/README.md`
- Create: `packages/desktop-bridge-linux/src/index.ts`
- Create: `packages/desktop-bridge-linux/src/linux.ts`
- Create: `packages/desktop-bridge-linux/bridge/atspi_bridge.py`
- Create: `tests/desktop-bridge-linux.test.mjs`
- Create: `examples/desktop-endpoints/linux-first-party.endpoint.json`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

**Interfaces:**
- Executable bin `q1x-desktop-bridge-linux`.
- Python worker receives structured JSON stdin and uses `gi.repository.Atspi` when available.

- [ ] **Step 1: Add RED tests**

Cover non-Linux refusal, Python/GI/Atspi discovery, graphical-session/AT-SPI bus diagnostics, worker protocol, result correlation and explicit Wayland/X11/session notes.

- [ ] **Step 2: Implement Node wrapper and Python AT-SPI worker**

Spawn `python3` directly with the bundled script path. Implement AT-SPI application/window/object traversal and action/text/value interfaces for the normalized supported action set. Do not emulate unsupported operations silently.

- [ ] **Step 3: Implement doctor/remediation**

Report whether `python3`, PyGObject/Atspi, display/session and accessibility bus are present. Remediation names the required OS package/session dependency without attempting privileged package installation.

- [ ] **Step 4: Verify in virtual graphical CI**

Use an Ubuntu virtual display/accessibility test fixture where feasible; otherwise the Phase 12 completion gate remains open and the matrix must not mark Linux desktop as tested.

- [ ] **Step 5: Commit**

Require focused tests, runtime bridge integration and package verification.

---

### Task 5: Runtime first-party bridge resolution

**Files:**
- Create: `packages/runtime/src/first-party-desktop.ts`
- Create: `tests/runtime-first-party-desktop.test.mjs`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/cli.ts`
- Modify: `packages/runtime/package.json`

**Interfaces:**
- Produces `getFirstPartyDesktopBridge(platform?)` and `createFirstPartyDesktopEndpoint()`.
- CLI can materialize a valid endpoint without hand-editing JSON.

- [ ] **Step 1: RED tests**

Assert recognized platform maps to the shipped package executable, unsupported platform fails, generated endpoint declares only supported actions and `desktop discover/run` can use it through `stdio-bridge`.

- [ ] **Step 2: Implement deterministic platform mapping**

Map `darwin -> q1x-desktop-bridge-macos`, `win32 -> q1x-desktop-bridge-windows`, `linux -> q1x-desktop-bridge-linux`. Do not treat unknown platforms as Linux.

- [ ] **Step 3: Add CLI endpoint setup path**

Expose a machine-readable command used later by connector configuration rather than forcing users to author endpoint JSON.

- [ ] **Step 4: Verify and commit**

Run runtime tests on all three OS matrices.
