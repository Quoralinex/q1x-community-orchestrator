# Phase 12 Starter Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ready-to-use first-party connector profiles for models, MCP, A2A, CLI tools and browser control so normal users configure values rather than write Q1X integration code.

**Architecture:** Profiles remain declarative and materialize through the existing model, adapter, browser and desktop endpoint registries. Deterministic local fixtures prove each profile path without external accounts; hosted-provider profiles only add configuration convenience and never move secrets into repository state.

**Tech Stack:** Node.js 24, TypeScript runtime, JSON profiles, existing MCP/A2A/CLI/browser/model transports, local HTTP/stdin fixtures.

**Spec:** `docs/superpowers/specs/2026-09-09-core-usability-ecosystem-design.md`

## Global Constraints

- Profiles configure existing protocol transports; they do not add provider switches to core.
- Secret values stay in environment variables.
- Remote HTTP must remain HTTPS except loopback development fixtures.
- Starter integrations must work without changing Q1X source code.
- Tests use deterministic local fixtures and do not require paid APIs.

---

### Task 1: Model connector profiles

**Files:**
- Create: `connectors/profiles/model-openai-chat-local.json`
- Create: `connectors/profiles/model-openai-responses-local.json`
- Create: `connectors/profiles/model-anthropic-messages-local.json`
- Create: `connectors/profiles/model-openai-compatible-hosted.json`
- Create: `connectors/profiles/model-anthropic-compatible-hosted.json`
- Create: `packages/runtime/src/connectors/materialize-model.ts`
- Create: `tests/runtime-model-profiles.test.mjs`

**Interfaces:**
- Profile parameters: endpoint URL, model id, optional credential environment key, optional header/prefix.
- `materializeModelConnector(definition, configuration)` returns a validated existing `ModelEndpoint` document.

- [ ] RED tests reject missing URL/model, embedded secrets and incompatible remote HTTP.
- [ ] Implement profile substitution using an allow-listed parameter map, never arbitrary templating/eval.
- [ ] Add deterministic local servers for all three wire protocols and invoke them through materialized profiles.
- [ ] Verify and commit.

---

### Task 2: MCP stdio and Streamable HTTP starter profiles

**Files:**
- Create: `connectors/profiles/mcp-stdio.json`
- Create: `connectors/profiles/mcp-streamable-http.json`
- Create: `packages/runtime/src/connectors/materialize-mcp.ts`
- Create: `tests/runtime-mcp-profiles.test.mjs`
- Create: `tests/fixtures/mcp-stdio-server.mjs`
- Create: `tests/fixtures/mcp-http-server.mjs`

**Interfaces:**
- stdio parameters: executable plus argv list and explicit environment-key mappings.
- HTTP parameters: HTTPS/loopback URL and optional credential environment reference.

- [ ] RED tests require valid endpoint materialization and discovery/invocation without source edits.
- [ ] Implement safe command/argv materialization and HTTP URL validation.
- [ ] Exercise real official MCP client discovery/call against deterministic fixtures.
- [ ] Verify and commit.

---

### Task 3: A2A starter profile

**Files:**
- Create: `connectors/profiles/a2a-jsonrpc.json`
- Create: `packages/runtime/src/connectors/materialize-a2a.ts`
- Create: `tests/runtime-a2a-profile.test.mjs`
- Create: `tests/fixtures/a2a-server.mjs`

**Interfaces:**
- Parameters: Agent Card URL, JSON-RPC endpoint if distinct, optional credential environment key.

- [ ] RED tests require Agent Card discovery and `message/send` execution through the profile.
- [ ] Implement validated materialization using the existing `a2a-jsonrpc` adapter transport.
- [ ] Prove partial/non-terminal states remain partial rather than falsely successful.
- [ ] Verify and commit.

---

### Task 4: Local CLI JSON/text starter profiles

**Files:**
- Create: `connectors/profiles/cli-json-stdio.json`
- Create: `connectors/profiles/cli-text-stdio.json`
- Create: `packages/runtime/src/connectors/materialize-cli.ts`
- Create: `tests/runtime-cli-profiles.test.mjs`
- Create: `tests/fixtures/cli-json-tool.mjs`
- Create: `tests/fixtures/cli-text-tool.mjs`

**Interfaces:**
- Parameters: executable, argv, stdin mode, timeout, max output and environment-key mappings.

- [ ] RED tests prove command existence, direct spawn/no shell, JSON/text normalization and bounded failures.
- [ ] Implement materialization over the existing CLI adapter endpoints.
- [ ] Prove both deterministic fixture tools execute through connector `test` and runtime adapter execution.
- [ ] Verify and commit.

---

### Task 5: Browser managed/CDP profiles and detection

**Files:**
- Create: `connectors/profiles/browser-managed-chromium.json`
- Create: `connectors/profiles/browser-existing-cdp.json`
- Create: `packages/runtime/src/connectors/browser-detection.ts`
- Create: `packages/runtime/src/connectors/materialize-browser.ts`
- Create: `tests/runtime-browser-profiles.test.mjs`

**Interfaces:**
- `detectInstalledBrowsers()` returns recognized executable candidates with platform/source metadata.
- `materializeBrowserConnector()` creates an existing validated `BrowserEndpoint`.

- [ ] RED tests cover platform-specific candidate paths, explicit executable override, missing browser remediation and invalid remote CDP URLs.
- [ ] Implement detection without launching arbitrary discovered executables.
- [ ] Materialize managed Chromium and existing-CDP endpoints.
- [ ] Exercise a local `data`-independent HTTP fixture page through managed browser/CDP where runner browser is available; retain blocked diagnostic where not supplied.
- [ ] Verify and commit.

---

### Task 6: First-party desktop connector profiles

**Files:**
- Create: `connectors/profiles/desktop-macos.json`
- Create: `connectors/profiles/desktop-windows.json`
- Create: `connectors/profiles/desktop-linux.json`
- Create: `packages/runtime/src/connectors/materialize-desktop.ts`
- Create: `tests/runtime-desktop-profiles.test.mjs`

**Interfaces:**
- Profiles choose the shipped first-party bridge package for the current OS and generate a validated `DesktopEndpoint`.

- [ ] RED tests prove users do not supply bridge executable paths for first-party desktop profiles.
- [ ] Implement mapping through `getFirstPartyDesktopBridge()` from the desktop plan.
- [ ] Reject cross-platform mismatch with `unsupported` rather than creating a broken endpoint.
- [ ] Verify profile -> endpoint -> existing stdio backend execution.
- [ ] Commit.

---

### Task 7: Catalogue seed and user-facing examples

**Files:**
- Modify: `connectors/catalogue.json`
- Create: `docs/connectors.md`
- Create: `examples/connectors/README.md`
- Create: `tests/phase12-connectors-docs.test.mjs`

**Interfaces:**
- Every built-in catalogue entry links to a real profile/materializer and concrete `q1x connectors` commands.

- [ ] RED docs tests require one complete configure/test example for each baseline category.
- [ ] Add only implemented connectors to catalogue.
- [ ] Document credential/environment prerequisites clearly and distinguish tested fixtures from provider-specific compatibility claims.
- [ ] Verify and commit.
