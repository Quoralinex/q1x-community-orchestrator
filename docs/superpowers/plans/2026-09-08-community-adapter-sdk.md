# Phase 11 Community Adapter SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the separate public `@quoralinex/q1x-community-adapter-sdk` package, conformance suite, runtime bridge, reference adapter, and four-package release governance.

**Architecture:** The new SDK depends only on the existing public core SDK and exposes adapter authoring/validation/conformance contracts. The runtime converts conforming `CommunityAdapter` implementations to its existing internal `AdapterTransport` interface through a narrow bridge. Operator-controlled registration remains explicit; no auto-loading, marketplace, package scanning, or secret store is introduced.

**Tech Stack:** TypeScript 7, Node.js 24 ESM, `node:test`, npm workspaces, GitHub Actions, existing Q1X SDK/runtime contracts.

**Spec:** `docs/superpowers/specs/2026-09-08-compatibility-matrix-community-adapter-sdk-design.md`

## Global Constraints

- Package name is exactly `@quoralinex/q1x-community-adapter-sdk`.
- Package version is exactly `0.1.0-alpha.1`.
- Node engine is `>=24`.
- Contract version is exactly `1.0.0`.
- Runtime compatibility line is exactly `0.1.x`.
- Protocol regex is `^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$`, maximum 64 characters.
- Q1X alpha-package dependencies use exact versions, never caret/range.
- PolyForm Noncommercial License 1.0.0 is included in the package.
- No dynamic package loading, shell execution, secret store, private Q1X API, runtime database access, audit-store access, browser-session access, or desktop-backend access is added by this SDK.

---

### Task 1: Package scaffold, public types and validation

**Files:**
- Create: `packages/adapter-sdk/package.json`
- Create: `packages/adapter-sdk/tsconfig.json`
- Create: `packages/adapter-sdk/LICENSE`
- Create: `packages/adapter-sdk/README.md`
- Create: `packages/adapter-sdk/src/index.ts`
- Create: `packages/adapter-sdk/src/types.ts`
- Create: `packages/adapter-sdk/src/validation.ts`
- Create: `tests/adapter-sdk-types.test.ts`
- Create: `tests/adapter-sdk.test.mjs`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `AdapterSdkVersion`, `AdapterCompatibility`, `CommunityAdapterContext`, `CommunityAdapter`, `AdapterValidationIssue`, `AdapterValidationResult`, `AdapterSdkError`, `ADAPTER_SDK_VERSION`, `createAdapterCompatibility`, `validateCommunityAdapter`, `assertCommunityAdapter`, `defineCommunityAdapter`.

- [ ] **Step 1: Write failing type/runtime tests**

Type test imports the package and constructs a valid `CommunityAdapter` using public `AdapterEndpoint`, `ExecutionRequest`, `ExecutionResult`, `CapabilityDescriptor` types. Runtime test imports built output and checks valid adapter acceptance plus rejection of invalid/overlong protocols, missing execute, SDK drift, contract drift and runtime-range drift.

- [ ] **Step 2: Run RED**

Run build/type/runtime tests. Expected failure: package/workspace missing.

- [ ] **Step 3: Implement minimal package**

`types.ts` defines the spec interfaces. `validation.ts` validates protocol and the exact compatibility tuple. `defineCommunityAdapter` validates then returns the same object. Error code values stay package-owned, for example `INVALID_ADAPTER`, `INCOMPATIBLE_ADAPTER`.

- [ ] **Step 4: Wire TypeScript references/workspace lock**

Root `tsconfig.json` adds `./packages/adapter-sdk` before runtime. Adapter SDK tsconfig references `../sdk-typescript` and emits declarations to `dist` following existing package conventions.

- [ ] **Step 5: Run GREEN**

Run build/type/runtime tests and `npm pack --dry-run --workspace packages/adapter-sdk`.

- [ ] **Step 6: Commit**

Commit message: `feat: add community adapter SDK package`.

---

### Task 2: Public conformance suite

**Files:**
- Create: `packages/adapter-sdk/src/conformance.ts`
- Modify: `packages/adapter-sdk/src/index.ts`
- Modify: `tests/adapter-sdk.test.mjs`

**Interfaces:**
- Produces: `AdapterConformanceCheck`, `AdapterConformanceReport`, `AdapterConformanceOptions`, `runAdapterConformance(adapter, options?)`.

- [ ] **Step 1: Write RED tests**

Cover a valid echo adapter, invalid metadata, invalid execution result contract version, invalid discover return, fixture mutation, and abort-signal propagation through a test adapter that records `context.signal`.

- [ ] **Step 2: Run RED**

Expected: `runAdapterConformance` missing.

- [ ] **Step 3: Implement structured conformance runner**

Use deterministic default endpoint/request fixtures. Deep-clone/freeze comparison inputs before calls. Return a report:

```ts
interface AdapterConformanceReport {
  ok: boolean;
  protocol?: string;
  checks: AdapterConformanceCheck[];
}
```

Each check has `name`, `ok`, and optional `message`. The runner never exits the process.

- [ ] **Step 4: Run GREEN**

Run adapter SDK tests.

- [ ] **Step 5: Commit**

Commit message: `feat: add community adapter conformance suite`.

---

### Task 3: Runtime bridge and explicit transport injection

**Files:**
- Create: `packages/runtime/src/community-adapter-bridge.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/package.json`
- Create: `tests/runtime-community-adapter.test.mjs`

**Interfaces:**
- Consumes: `CommunityAdapter`, `assertCommunityAdapter`.
- Produces: `communityAdapterTransport(adapter): AdapterTransport` and safe runtime open option `adapterTransports?: readonly AdapterTransport[]`.

- [ ] **Step 1: Write RED bridge integration test**

Open a runtime with a community echo adapter injected alongside defaults, persist an adapter endpoint for its protocol, execute/discover, assert exact delegated result/capability output, and verify existing built-in transports remain registered.

- [ ] **Step 2: Run RED**

Expected: bridge/open option missing.

- [ ] **Step 3: Implement bridge**

Map only `signal`, `env`, and `fetch` from `AdapterTransportContext`. Do not pass runtime/store internals.

- [ ] **Step 4: Implement safe runtime injection**

Extend `RuntimeOpenOptions`:

```ts
export interface RuntimeOpenOptions {
  home?: string;
  adapterTransports?: readonly AdapterTransport[];
}
```

Create the default registry, register each supplied transport after defaults, and preserve duplicate-protocol conflict semantics.

- [ ] **Step 5: Run GREEN**

Run runtime adapter tests and complete runtime test suite.

- [ ] **Step 6: Commit**

Commit message: `feat: bridge community adapters into runtime`.

---

### Task 4: Reference adapter template

**Files:**
- Create: `examples/community-adapter/package.json`
- Create: `examples/community-adapter/tsconfig.json`
- Create: `examples/community-adapter/src/index.ts`
- Create: `examples/community-adapter/test/adapter.test.mjs`
- Create: `examples/community-adapter/README.md`
- Create: `tests/community-adapter-example.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: deterministic local `community.echo` reference adapter.

- [ ] **Step 1: Write RED repository example test**

Require template files, buildable source, no network/secret/browser/native dependency declarations, and a passing conformance report.

- [ ] **Step 2: Run RED**

Expected: example absent.

- [ ] **Step 3: Implement example**

Echo adapter returns the request input in a contract-valid `ExecutionResult`; discover returns one deterministic capability. README explains explicit registration and security/trust limits.

- [ ] **Step 4: Run GREEN**

Run example test plus adapter conformance tests.

- [ ] **Step 5: Commit**

Commit message: `docs: add community adapter reference template`.

---

### Task 5: Four-package release governance

**Files:**
- Modify: `scripts/release/release-metadata.mjs`
- Modify: `scripts/release/verify-packed-consumer.mjs`
- Modify: `scripts/release/prepare-alpha.mjs` if package iteration is not metadata-driven
- Modify: `.github/workflows/public-alpha.yml`
- Modify: `.github/workflows/contracts-ci.yml` if required
- Modify: `.github/workflows/cross-platform-packaging.yml`
- Modify: `tests/release-commissioning.test.mjs`
- Modify: `tests/packaging.test.mjs`

**Interfaces:**
- Produces: exact governed package set of four packages.

- [ ] **Step 1: Write RED release tests**

Require adapter SDK in exact package set, exact version/dependency alignment, tarball preparation, external consumer imports, and dry-run packaging.

- [ ] **Step 2: Run RED**

Expected: package-set drift/fourth package absent from release metadata.

- [ ] **Step 3: Update release metadata and consumer verification**

Order packages deterministically: contracts, core SDK, adapter SDK, runtime. Consumer imports adapter SDK and constructs/validates a minimal adapter in addition to existing checks.

- [ ] **Step 4: Update optional npm publish lane**

When enabled, publish in dependency order: contracts → core SDK → adapter SDK → runtime. Keep Trusted Publishing/OIDC only; no token fallback.

- [ ] **Step 5: Run GREEN**

Run release commissioning tests, prepare alpha bundle, packed external consumer, packaging tests and dry-runs.

- [ ] **Step 6: Commit**

Commit message: `build: govern adapter SDK in alpha package set`.

---

### Task 6: Adapter SDK documentation and Phase 11 status integration

**Files:**
- Create: `docs/community-adapter-sdk.md`
- Modify: `packages/adapter-sdk/README.md`
- Modify: `README.md`
- Modify: `docs/index.md`
- Modify: `docs/agent-cli-adapters.md`
- Modify: `docs/public-alpha.md`
- Modify: `docs/known-limitations.md`
- Modify: `docs/roadmap.md`
- Modify: `CHANGELOG.md`
- Modify: `tests/packaging.test.mjs`

**Interfaces:**
- Produces: public authoring/trust/version documentation and final Phase 11 repository status.

- [ ] **Step 1: Add RED docs acceptance tests**

Require separate package name, explicit no-sandbox warning, operator-controlled installation/registration, exact compatibility line, reference example path, conformance-vs-trust distinction, compatibility matrix link, and Phase 11 status wording.

- [ ] **Step 2: Run RED**

Expected: docs incomplete.

- [ ] **Step 3: Write docs**

Explain the SDK API, conformance runner, runtime bridge, example, security boundaries, versioning and PolyForm Noncommercial implications. Do not claim npm availability unless actually commissioned.

- [ ] **Step 4: Run GREEN**

Run root tests, type tests, dist tests, compatibility tests and runtime tests.

- [ ] **Step 5: Commit**

Commit message: `docs: complete Phase 11 community adapter SDK`.

---

### Task 7: Final exact-head acceptance, PR and merge

**Files:**
- No new implementation files unless a gate finds a real defect.

**Interfaces:**
- Produces: accepted Phase 11 merge on protected `main`.

- [ ] **Step 1: Audit branch diff**

Confirm no credentials, private control-plane material, proprietary prompts/policies or unapproved auto-loading mechanisms.

- [ ] **Step 2: Require exact-head green gates**

Verify Repository Baseline, Runtime and Contracts, CodeQL, Cross-platform Packaging (Ubuntu/macOS/Windows/Docker), Compatibility Matrix and Public Alpha Commissioning.

- [ ] **Step 3: Verify four-package artifact preparation**

Require clean packed-consumer success and SHA-256 release evidence on exact head.

- [ ] **Step 4: Update final status docs only after gates are green**

Mark Phase 11 implemented/public-alpha candidate; do not claim `v0.1.0-alpha.1` released unless the manual protected release workflow has actually created it.

- [ ] **Step 5: Re-run exact-head gates after status-only commit**

All same gate families must pass again.

- [ ] **Step 6: Mark PR ready and squash merge with expected-head guard**

- [ ] **Step 7: Verify merged `main` SHA and post-merge gates**

Require the same gate set plus Pages where docs changed.
