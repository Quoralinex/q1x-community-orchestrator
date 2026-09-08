# Phase 11 — Compatibility Matrix and Community Adapter SDK Design

**Date:** 8 September 2026  
**Status:** Approved for implementation  
**Repository:** `Quoralinex/q1x-community-orchestrator`  
**Base:** Phase 10 merged `main` at `371b27e265a5922184d0a48f57b966b9fbae959b`

## 1. Purpose

Phase 11 closes the public-alpha delivery sequence by adding two public, evidence-driven capabilities:

1. a deterministic compatibility matrix that says what the Community Orchestrator has actually verified, what remains experimental, and what is unsupported; and
2. a separate public package, `@quoralinex/q1x-community-adapter-sdk`, for authoring third-party adapters without depending on runtime internals.

The phase must preserve the public/community boundary, provider neutrality, OS neutrality, zero-provider-bill local paths, and the PolyForm Noncommercial License 1.0.0.

## 2. Non-goals

Phase 11 does not add:

- a plugin marketplace or remote adapter registry;
- dynamic download or installation of arbitrary code;
- automatic loading from unknown directories;
- privileged lifecycle hooks;
- a secret store;
- private Q1X control-plane interfaces, enterprise policy corpora, proprietary prompts, or confidential infrastructure;
- universal compatibility claims based on inference rather than evidence;
- a stable/GA compatibility promise.

## 3. Architecture choice

### 3.1 Compatibility matrix

Use an evidence-driven, machine-readable matrix as the source of truth and generate human-readable Markdown from it. Entries are labelled only `tested`, `experimental`, or `unsupported`.

A `tested` entry is invalid unless it includes concrete verification evidence. Unknown combinations are not promoted by implication: they remain absent or explicitly unsupported.

### 3.2 Community Adapter SDK

Create a new public workspace package:

`@quoralinex/q1x-community-adapter-sdk`

This package reuses public execution, capability, endpoint and identifier types from `@quoralinex/q1x-community-sdk`, but it does not expose `OpenControlRuntime`, `AdapterTransportRegistry`, SQLite state, audit storage, browser/session internals, desktop backend internals, or other runtime implementation details.

The runtime keeps its current `AdapterTransport`/`AdapterTransportRegistry` seam. A narrow bridge converts a conforming `CommunityAdapter` into the internal runtime transport interface.

## 4. Compatibility matrix model

### 4.1 Source file

Create a versioned JSON document at:

`compatibility/matrix.json`

Top-level shape:

```ts
interface CompatibilityMatrix {
  matrixVersion: '1.0.0';
  projectVersion: string;
  generatedFrom: string;
  entries: CompatibilityEntry[];
}
```

Each entry contains:

```ts
type CompatibilityStatus = 'tested' | 'experimental' | 'unsupported';
type CompatibilityEvidenceKind = 'ci' | 'manual';

interface CompatibilityEntry {
  id: string;
  category: 'os' | 'deployment' | 'package-consumer' | 'model-transport' | 'adapter' | 'browser' | 'desktop' | 'protocol';
  target: string;
  status: CompatibilityStatus;
  implementation?: string;
  version?: string;
  evidence?: {
    kind: CompatibilityEvidenceKind;
    source: string;
    commitSha: string;
  }[];
  constraints?: string[];
  notes?: string;
}
```

### 4.2 Validation rules

Validation is fail-closed:

- `matrixVersion` must be exactly `1.0.0`;
- entry IDs are unique and stable;
- category and status values are closed enums;
- `tested` requires at least one evidence item;
- evidence commit SHA must be exactly 40 lowercase hexadecimal characters;
- CI evidence `source` must identify a repository workflow or test file, not an unverifiable prose claim;
- `experimental` must carry either `constraints` or `notes` explaining the caveat;
- duplicate `(category,target,implementation,version)` records are rejected;
- entries sort deterministically by `category`, then `target`, then `implementation`, then `version`, then `id`;
- unsupported entries must not contain evidence that claims successful verification.

### 4.3 Initial matrix evidence

The initial matrix may mark as `tested` only combinations already verified by repository CI or new Phase 11 tests. At minimum this includes:

- source installation on GitHub-hosted Ubuntu 24.04;
- source installation on GitHub-hosted macOS latest;
- source installation on GitHub-hosted Windows latest;
- Linux Docker/OCI non-root image path;
- packed external-consumer installation of the governed public package set;
- the built-in MCP stdio/Streamable HTTP, A2A JSON-RPC, and local CLI transports only to the extent existing/new tests actually exercise them;
- Playwright/Chromium browser control only where real browser tests provide evidence;
- desktop stdio bridge only where contract/integration tests provide evidence.

Provider/model/browser/desktop combinations that are not actually exercised must remain `experimental` or `unsupported`.

### 4.4 Generated documentation

Create `scripts/compatibility/generate-matrix.mjs` to validate and render:

`docs/compatibility-matrix.md`

The generated file must include:

- project/version metadata;
- a legend for tested/experimental/unsupported;
- grouped tables by category;
- evidence source and commit SHA for tested entries;
- caveats for experimental entries;
- a statement that absence from the matrix is not a compatibility claim.

CI regenerates the Markdown and fails if the checked-in file differs.

## 5. Community Adapter SDK public API

### 5.1 Package identity

`packages/adapter-sdk/package.json`

- name: `@quoralinex/q1x-community-adapter-sdk`
- version: `0.1.0-alpha.1`
- `type: module`
- Node engine `>=24`
- public publish configuration
- PolyForm Noncommercial License 1.0.0 via package `LICENSE`
- exact dependency on `@quoralinex/q1x-community-sdk` `0.1.0-alpha.1`

The Phase 10 release metadata/package-set logic must be deliberately updated to four packages rather than silently accepting workspace drift.

### 5.2 Public types

```ts
export type AdapterSdkVersion = '0.1.0-alpha.1';

export interface AdapterCompatibility {
  sdkVersion: AdapterSdkVersion;
  contractVersion: '1.0.0';
  runtimeRange: '0.1.x';
}

export interface CommunityAdapterContext {
  signal?: AbortSignal;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
}

export interface CommunityAdapter {
  readonly protocol: string;
  readonly compatibility: AdapterCompatibility;
  execute(endpoint: AdapterEndpoint, request: ExecutionRequest, context?: CommunityAdapterContext): Promise<ExecutionResult>;
  discover?(endpoint: AdapterEndpoint, context?: CommunityAdapterContext): Promise<readonly CapabilityDescriptor[]>;
}
```

The public protocol ID must pass a conservative validation rule:

`^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$`

with a bounded maximum length of 64 characters.

### 5.3 Validation and helpers

Export:

- `ADAPTER_SDK_VERSION`
- `createAdapterCompatibility()` returning the exact supported compatibility tuple;
- `validateCommunityAdapter(adapter)` returning a structured conformance result;
- `assertCommunityAdapter(adapter)` throwing a package-owned `AdapterSdkError` on invalid metadata;
- `defineCommunityAdapter(adapter)` as an identity helper that asserts the adapter before returning it;
- deterministic test fixtures for a local echo adapter.

Validation must reject:

- empty/invalid/overlong protocols;
- missing execute function;
- SDK version drift;
- contract version drift;
- runtime range drift;
- adapters that attempt to declare unsupported compatibility metadata shapes.

## 6. Runtime bridge and registration

### 6.1 Bridge

Add a runtime-only bridge:

`packages/runtime/src/community-adapter-bridge.ts`

Publicly export:

```ts
export function communityAdapterTransport(adapter: CommunityAdapter): AdapterTransport;
```

The bridge:

- validates the community adapter with `assertCommunityAdapter`;
- preserves the adapter protocol exactly;
- maps the runtime context to the public SDK context without adding secret values beyond those already intentionally provided to runtime execution;
- delegates `execute` and optional `discover`;
- preserves existing runtime result/capability validation paths;
- does not grant filesystem, shell, browser, desktop, database, audit, approval or checkpoint access by itself.

### 6.2 Operator-controlled registration

Phase 11 provides explicit programmatic registration only. Example:

```ts
const runtime = new OpenControlRuntime({
  adapterTransports: [communityAdapterTransport(myAdapter)]
});
```

If the current runtime constructor does not expose a safe adapter transport injection path, add the smallest explicit constructor option required. Do not implement package scanning, auto-import, or arbitrary module-path loading in the CLI.

## 7. Reference adapter template

Create a copyable reference under:

`examples/community-adapter/`

It must contain:

- `package.json` with local workspace-compatible dependencies;
- `src/index.ts` implementing a local, deterministic echo adapter;
- `test/adapter.test.mjs` using the public conformance utilities;
- `README.md` explaining build, test, registration, version compatibility, trust boundaries and licence implications.

The example must require no network, paid provider, secret, browser binary or native desktop bridge.

## 8. Conformance suite

Create package-owned conformance utilities that can be called by third-party tests.

`runAdapterConformance(adapter, options?)` must test:

1. metadata validity;
2. protocol determinism;
3. execute returns an `ExecutionResult` with contract version `1.0.0`;
4. discover, when present, returns capability descriptors rather than arbitrary values;
5. abort-signal propagation where the adapter accepts a context;
6. no mutation of the provided endpoint/request fixtures during the test.

The conformance suite returns a structured report instead of exiting the process.

Repository CI must run the reference adapter through this suite.

## 9. Trust and security boundaries

Community adapters are application code installed and selected by the operator. Passing conformance does not make third-party code trustworthy.

The SDK documentation must explicitly state:

- adapters execute with the privileges of the process that loads them;
- Q1X does not sandbox arbitrary JavaScript modules;
- operators must review adapter source/dependencies and use OS/container isolation where appropriate;
- secrets should remain environment references/configuration supplied at invocation time, not hard-coded values;
- the adapter SDK does not bypass Phase 9 approval/evidence/audit policies around consequential work orchestrated by the runtime;
- the bridge does not expose Q1X internal state stores or private control-plane capabilities.

## 10. Release and version governance

Phase 11 adds a fourth governed public package. Release tooling must fail closed unless the exact expected package set is:

1. `@quoralinex/q1x-community-contracts`
2. `@quoralinex/q1x-community-sdk`
3. `@quoralinex/q1x-community-adapter-sdk`
4. `@quoralinex/q1x-community-runtime`

All remain version `0.1.0-alpha.1` for the current alpha line.

The runtime depends on the adapter SDK using the exact alpha version. The adapter SDK depends on the core SDK using the exact alpha version. No broad caret/range is permitted for Q1X alpha-package dependencies.

Phase 11 must not create a new release tag while `v0.1.0-alpha.1` remains uncommissioned. The existing Phase 10 protected release dispatch remains authoritative for that tag.

## 11. Testing and CI

Phase 11 acceptance requires:

- compatibility matrix unit validation;
- deterministic generation test;
- checked-in generated Markdown drift test;
- adapter SDK type tests;
- adapter SDK runtime/conformance tests;
- runtime bridge integration tests;
- reference adapter tests;
- release package-set tests updated to four packages;
- clean packed external-consumer verification updated to include the adapter SDK;
- macOS/Windows/Linux source-install/package dry-run matrix green;
- Docker green;
- Repository Baseline green;
- Runtime and Contracts green;
- CodeQL green;
- Public Alpha Commissioning validation green;
- PolyForm Noncommercial distribution checks green.

A new compatibility workflow may be added if it makes evidence clearer, but it must not duplicate the entire existing packaging workflow. Prefer one focused compatibility-validation job plus reuse of existing workflow evidence.

## 12. Documentation

Update:

- `README.md`
- `docs/index.md`
- `docs/roadmap.md`
- `docs/public-alpha.md`
- `docs/known-limitations.md`
- `docs/agent-cli-adapters.md`
- `CHANGELOG.md`

Add:

- `docs/compatibility-matrix.md` (generated)
- `docs/community-adapter-sdk.md`

Documentation must distinguish:

- tested compatibility from experimental compatibility;
- conformance from trust/security review;
- public Community Adapter SDK from private Q1X capabilities;
- GitHub alpha artifacts from optional npm availability.

## 13. Acceptance criteria

Phase 11 is accepted only when:

1. the compatibility matrix source validates and generated docs are deterministic;
2. every `tested` matrix entry has concrete evidence;
3. the separate adapter SDK builds and packs as a public alpha package;
4. the reference adapter passes the public conformance suite without network/secrets;
5. the runtime bridge executes/discovers through a community adapter without exposing runtime internals;
6. release commissioning recognises exactly four governed packages and clean packed-consumer verification succeeds;
7. all exact-head CI/security/cross-platform/public-alpha validation gates pass;
8. docs accurately state limitations and trust boundaries;
9. no private/proprietary Q1X material enters the public release surface;
10. PR is squash-merged to protected `main` and the merged SHA passes the same gates again.

The separate manual Phase 10 `workflow_dispatch` required to create `v0.1.0-alpha.1` is an external commissioning action and may remain outstanding while Phase 11 implementation proceeds, but final public-release conclusions must state its status accurately.
