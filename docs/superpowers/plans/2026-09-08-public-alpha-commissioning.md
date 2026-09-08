# Phase 10 Public Alpha Commissioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fail-closed, reproducible `v0.1.0-alpha.1` public-alpha commissioning path that validates version alignment, packs and verifies the three public packages, generates integrity evidence, tests a clean external consumer, and creates a GitHub prerelease only from verified protected `main`.

**Architecture:** Add a small release-tooling boundary under `scripts/release/` with pure identity/manifest helpers and executable preparation/consumer-verification entry points. Test all behavior locally through Node's built-in test runner, then add a pinned GitHub Actions commissioning workflow that reuses those scripts in validation mode and gates any tag/release creation behind explicit manual release mode on `main`. Keep npm publication optional and separate from GitHub commissioning.

**Tech Stack:** Node.js 24+, ECMAScript modules, Node built-in test runner, npm 11 `npm pack`, SHA-256 via `node:crypto`, GitHub Actions with full-SHA-pinned actions, GitHub CLI for release creation, existing TypeScript 7 workspace build.

**Spec:** `docs/superpowers/specs/2026-09-08-public-alpha-commissioning-design.md`

## Global Constraints

- First public alpha version is exactly `0.1.0-alpha.1`; Git tag is exactly `v0.1.0-alpha.1`.
- Public package set is exactly `@quoralinex/q1x-community-contracts`, `@quoralinex/q1x-community-sdk`, and `@quoralinex/q1x-community-runtime`.
- All three public packages must remain version-locked and internal dependencies must reference exact matching versions.
- Root workspace remains `private: true` and must never be publishable.
- GitHub prerelease is authoritative; npm publication is optional and disabled unless explicitly authorised.
- Release creation may occur only from the accepted protected `main` commit after validation; ordinary tag pushes are not an alternate release path.
- Source, packed-package and local Docker paths must remain zero-provider-bill capable.
- No provider credentials, npm token, private Q1X control-plane code, enterprise policy corpus, proprietary prompts or confidential infrastructure may enter release artifacts.
- PolyForm Noncommercial License 1.0.0 remains the default public repository/package licence.
- Phase 11 compatibility matrix and Community Adapter SDK remain out of Phase 10 scope.

---

### Task 1: Release identity and package alignment contract

**Files:**
- Create: `tests/release-commissioning.test.mjs`
- Create: `scripts/release/release-metadata.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `PUBLIC_PACKAGES`, `readReleaseIdentity(root)`, and `assertReleaseIdentity(identity)` from `scripts/release/release-metadata.mjs`.
- `readReleaseIdentity(root)` returns `{ version, tag, rootPrivate, packages: [{ name, version, directory, dependencies }] }`.
- `assertReleaseIdentity(identity)` returns the validated identity or throws a descriptive `Error` for root/publication, version, tag, package-set or exact-internal-dependency mismatches.

- [ ] **Step 1: Write the failing identity tests and wire them into `npm test`**

Create `tests/release-commissioning.test.mjs` with tests that import the missing release helper and require exact alpha alignment:

```js
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertReleaseIdentity, readReleaseIdentity } from '../scripts/release/release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('public alpha identity is exact and version locked', async () => {
  const identity = await readReleaseIdentity(root);
  assert.equal(identity.version, '0.1.0-alpha.1');
  assert.equal(identity.tag, 'v0.1.0-alpha.1');
  assert.equal(identity.rootPrivate, true);
  assert.deepEqual(identity.packages.map(item => item.name), [
    '@quoralinex/q1x-community-contracts',
    '@quoralinex/q1x-community-sdk',
    '@quoralinex/q1x-community-runtime'
  ]);
  assert.equal(assertReleaseIdentity(identity), identity);
});

test('release identity rejects a mismatched internal dependency', async () => {
  const identity = await readReleaseIdentity(root);
  const copy = structuredClone(identity);
  copy.packages.find(item => item.name === '@quoralinex/q1x-community-runtime').dependencies['@quoralinex/q1x-community-sdk'] = '^0.1.0-alpha.1';
  assert.throws(() => assertReleaseIdentity(copy), /exact internal dependency/i);
});
```

Modify root `package.json` `test` script to include `tests/release-commissioning.test.mjs`.

- [ ] **Step 2: Run CI and verify RED**

Expected: Runtime and Contracts fails during `npm test` because `scripts/release/release-metadata.mjs` does not exist. Repository Baseline/CodeQL/cross-platform may remain green.

- [ ] **Step 3: Implement the minimal release identity helper**

Create `scripts/release/release-metadata.mjs` with `PUBLIC_PACKAGES`, JSON readers, exact version/tag derivation, package-set validation, root `private === true` validation and exact dependency checks for dependencies between the three public packages.

Core shape:

```js
export const PUBLIC_PACKAGES = [
  ['@quoralinex/q1x-community-contracts', 'packages/contracts'],
  ['@quoralinex/q1x-community-sdk', 'packages/sdk-typescript'],
  ['@quoralinex/q1x-community-runtime', 'packages/runtime']
];

export async function readReleaseIdentity(root) { /* read exact package.json files */ }
export function assertReleaseIdentity(identity) { /* reject drift; return identity */ }
```

- [ ] **Step 4: Run verification and require GREEN**

Run through GitHub CI: `npm test`, `npm run test:dist`, existing runtime tests, cross-platform packaging and CodeQL must pass.

- [ ] **Step 5: Commit**

Commit message: `Phase 10: enforce public alpha release identity`.

---

### Task 2: Release artifact manifest and checksum generation

**Files:**
- Modify: `tests/release-commissioning.test.mjs`
- Modify: `scripts/release/release-metadata.mjs`
- Create: `scripts/release/prepare-alpha.mjs`

**Interfaces:**
- Produces: `sha256File(path)`, `buildReleaseManifest({ identity, sourceSha, artifacts, generatedAt })`, `formatChecksums(artifacts)`.
- `prepare-alpha.mjs --output <dir> --source-sha <sha>` builds workspaces, creates exactly three npm tarballs under `<dir>`, writes `release-manifest.json` and `SHA256SUMS`, verifies all hashes, and prints the manifest as JSON to stdout.

- [ ] **Step 1: Add failing manifest tests**

Add tests that create temporary artifact files, hash them, build a manifest, and require deterministic checksum ordering plus rejection of a non-40-hex source SHA.

```js
assert.match(await sha256File(file), /^[0-9a-f]{64}$/);
const manifest = buildReleaseManifest({ identity, sourceSha: 'a'.repeat(40), artifacts, generatedAt: '2026-09-08T00:00:00.000Z' });
assert.equal(manifest.status, 'public-alpha');
assert.equal(manifest.tag, 'v0.1.0-alpha.1');
assert.deepEqual(manifest.artifacts.map(item => item.filename), [...].sort());
assert.throws(() => buildReleaseManifest({ ...input, sourceSha: 'main' }), /source sha/i);
```

- [ ] **Step 2: Verify RED**

Expected: Runtime and Contracts fails because the new manifest/hash exports and preparation command do not exist.

- [ ] **Step 3: Implement pure hash/manifest helpers and the preparation command**

Use `createHash('sha256')`, `npm pack --workspace <workspace> --pack-destination <output> --json`, and JSON parsing. Manifest fields must include:

```json
{
  "manifestVersion": "1.0.0",
  "version": "0.1.0-alpha.1",
  "tag": "v0.1.0-alpha.1",
  "sourceSha": "<40 hex>",
  "node": ">=24",
  "status": "public-alpha",
  "license": "PolyForm Noncommercial License 1.0.0",
  "targets": ["macOS", "Windows", "Linux", "Docker"],
  "packages": [],
  "artifacts": [],
  "generatedAt": "<ISO date>"
}
```

`SHA256SUMS` lines must be `<digest>  <filename>` sorted by filename.

- [ ] **Step 4: Verify GREEN including a real artifact build**

CI command added to Runtime and Contracts:

```bash
rm -rf .release-test
node scripts/release/prepare-alpha.mjs --output .release-test --source-sha "$GITHUB_SHA"
node --test tests/release-commissioning.test.mjs
```

The command must produce three `.tgz` files, `release-manifest.json` and `SHA256SUMS` without registry publication.

- [ ] **Step 5: Commit**

Commit message: `Phase 10: generate release integrity artifacts`.

---

### Task 3: Clean packed-package consumer verification

**Files:**
- Modify: `tests/release-commissioning.test.mjs`
- Create: `scripts/release/verify-packed-consumer.mjs`
- Modify: `.github/workflows/contracts-ci.yml`

**Interfaces:**
- Produces CLI `node scripts/release/verify-packed-consumer.mjs --artifacts <dir>`.
- The verifier consumes `release-manifest.json` and the three tarballs generated by Task 2 and exits non-zero on manifest/hash/install/import/type/CLI failure.

- [ ] **Step 1: Add failing verifier contract test**

Add a test that imports `verifyPackedConsumer` and rejects a missing artifact directory, proving the exported API exists and fails clearly:

```js
await assert.rejects(
  () => verifyPackedConsumer(join(tmpdir(), 'q1x-missing-release-artifacts')),
  /release-manifest\.json/i
);
```

- [ ] **Step 2: Verify RED**

Expected: Runtime and Contracts fails because `verify-packed-consumer.mjs` does not exist.

- [ ] **Step 3: Implement the clean consumer verifier**

The verifier must:

```text
read manifest -> verify every SHA-256 -> mkdtemp consumer -> npm init -y ->
npm install --ignore-scripts --no-audit --no-fund <contracts.tgz> <sdk.tgz> <runtime.tgz> ->
node import smoke -> strict TypeScript compile using repository TypeScript binary ->
node packed q1x CLI --home <temp-home> init -> require JSON contractVersion === "1.0.0" -> cleanup
```

The import smoke must import from public package names, not repository-relative paths.

- [ ] **Step 4: Add and run full commissioning verification in Runtime and Contracts**

After `prepare-alpha.mjs`, run:

```bash
node scripts/release/verify-packed-consumer.mjs --artifacts .release-test
```

Expected: clean install succeeds without npm registry access for Q1X packages, SDK import/type smoke passes, packed runtime CLI initialises successfully.

- [ ] **Step 5: Commit**

Commit message: `Phase 10: verify packed packages as an external consumer`.

---

### Task 4: Fail-closed Public Alpha Commissioning workflow

**Files:**
- Modify: `tests/packaging.test.mjs`
- Create: `.github/workflows/public-alpha.yml`

**Interfaces:**
- Validation mode: `pull_request` plus `workflow_dispatch` with `release=false`; permissions `contents: read`.
- Release mode: explicit `workflow_dispatch` input `release=true` on `refs/heads/main`; release job gets `contents: write` only after validation completes.
- Optional npm publish job: explicit `publish_npm=true`, requires release mode and environment authority, `id-token: write`, and no stored npm token in repository/workflow text.

- [ ] **Step 1: Add failing static workflow policy tests**

Extend `tests/packaging.test.mjs` to require:

```js
const workflow = await text('.github/workflows/public-alpha.yml');
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /release:/);
assert.match(workflow, /publish_npm:/);
assert.match(workflow, /refs\/heads\/main/);
assert.match(workflow, /scripts\/release\/prepare-alpha\.mjs/);
assert.match(workflow, /scripts\/release\/verify-packed-consumer\.mjs/);
assert.match(workflow, /gh release create/);
assert.doesNotMatch(workflow, /NPM_TOKEN|npm_[A-Za-z0-9]/);
for (const ref of [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1])) assert.match(ref, /@[0-9a-f]{40}$/);
```

- [ ] **Step 2: Verify RED**

Expected: packaging test fails because `.github/workflows/public-alpha.yml` is absent.

- [ ] **Step 3: Implement validation and release jobs**

Workflow rules:

```yaml
on:
  pull_request:
  workflow_dispatch:
    inputs:
      release:
        type: boolean
        default: false
      publish_npm:
        type: boolean
        default: false
permissions:
  contents: read
```

Validation runs install/build/check, `prepare-alpha`, `verify-packed-consumer`, uploads the governed artifact bundle with a pinned `actions/upload-artifact` SHA.

Release job condition requires manual dispatch, `release == true`, and `github.ref == 'refs/heads/main'`; it downloads the exact validation artifact, re-verifies checksums, rejects an existing tag, creates `v0.1.0-alpha.1`, and runs:

```bash
gh release create "v0.1.0-alpha.1" .release/* --prerelease --verify-tag --title "Q1X Community Orchestrator v0.1.0-alpha.1" --notes-file RELEASE_NOTES.md
```

Release job uses `permissions: contents: write` only at job level.

Optional npm job must be separately conditioned on `publish_npm == true`, use an environment such as `npm-public-alpha`, use `id-token: write`, and execute `npm publish --provenance --access public <tgz>` only after downloading and verifying the immutable release artifacts.

- [ ] **Step 4: Verify GREEN**

`npm test` must pass static workflow tests; PR-triggered Public Alpha workflow must run validation only and must not create a tag or release.

- [ ] **Step 5: Commit**

Commit message: `Phase 10: add fail-closed public alpha workflow`.

---

### Task 5: Public-alpha documentation and release notes

**Files:**
- Create: `CHANGELOG.md`
- Create: `RELEASE_NOTES.md`
- Create: `docs/public-alpha.md`
- Create: `docs/known-limitations.md`
- Modify: `README.md`
- Modify: `docs/index.md`
- Modify: `docs/deployment.md`
- Modify: `docs/roadmap.md`
- Modify: `tests/packaging.test.mjs`

**Interfaces:**
- Documentation test defines required public-alpha content and ensures the release workflow's `--notes-file RELEASE_NOTES.md` target exists.

- [ ] **Step 1: Add failing documentation acceptance test**

Extend `tests/packaging.test.mjs` to require files and exact concepts:

```js
const alpha = await text('docs/public-alpha.md');
assert.match(alpha, /0\.1\.0-alpha\.1/);
assert.match(alpha, /source installation/i);
assert.match(alpha, /packed package/i);
assert.match(alpha, /Docker/i);
assert.match(alpha, /health/i);
assert.match(alpha, /rollback/i);
assert.match(alpha, /security/i);
const limits = await text('docs/known-limitations.md');
assert.match(limits, /actor identifiers.*not cryptographically authenticated/is);
assert.match(limits, /not an externally anchored transparency log/i);
assert.match(limits, /browser binaries are not bundled/i);
assert.match(limits, /breaking changes/i);
```

- [ ] **Step 2: Verify RED**

Expected: packaging test fails because public-alpha documentation files are absent.

- [ ] **Step 3: Write the complete public-alpha documentation**

`docs/public-alpha.md` must provide exact source/tarball/Docker install commands, sample company-launch mission commands, `/healthz` and `/readyz` checks, browser/desktop setup boundaries, artifact checksum verification, security-reporting link, backup-first upgrade and rollback procedure.

`docs/known-limitations.md` must include all eight limitations from the Phase 10 spec without broadening support claims.

`RELEASE_NOTES.md` must name version/tag/source-SHA placeholder as generated workflow metadata only where GitHub injects it; the static file itself must not falsely claim a commit SHA. It must identify the release as experimental public alpha and point to Phase 11 for the formal compatibility matrix.

`CHANGELOG.md` must include an entry for `0.1.0-alpha.1` covering Phases 1–9 and commissioning changes.

README/Pages docs/roadmap must state Phase 10 is in delivery until exact final CI passes; only then change to implemented.

- [ ] **Step 4: Verify GREEN**

Run `npm test`, repository link/content checks available in CI, and full baseline gates.

- [ ] **Step 5: Commit**

Commit message: `Phase 10: document public alpha commissioning`.

---

### Task 6: Final acceptance, merge, and governed alpha commissioning

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: PR body/status only after evidence is green
- No production implementation changes unless a new failing regression requires them.

**Interfaces:**
- Final Phase 10 head is accepted only if Repository Baseline, Runtime and Contracts, CodeQL, Cross-platform Packaging and Public Alpha validation all pass on the same exact head.

- [ ] **Step 1: Run the complete pre-status acceptance set**

Require green:

```text
Repository Baseline
Runtime and Contracts
CodeQL
Cross-platform Packaging: Ubuntu + Windows + macOS + Docker
Public Alpha Commissioning validation
release-commissioning tests
packed external consumer verification
manifest/checksum verification
PolyForm/distribution tests
```

- [ ] **Step 2: Perform public/private and release-surface audit**

Verify PR changed files contain no private control-plane, credential, enterprise-policy or proprietary infrastructure material. Verify root remains private, package set remains exactly three, release workflow has no ordinary tag trigger, and npm publication remains explicit/optional.

- [ ] **Step 3: Mark Phase 10 implemented in documentation**

Only after Step 1 and Step 2 pass, change README/roadmap from `in delivery` to `Implemented in pre-alpha/public alpha commissioning` without claiming GA.

- [ ] **Step 4: Re-run the complete acceptance set on the documentation-final exact head**

All five workflow families must be green again. No stale-head evidence is accepted.

- [ ] **Step 5: Complete PR and squash merge with expected-head guard**

Mark PR ready only after no unresolved review threads remain. Squash merge into `main` with `expected_head_sha` equal to the fully verified documentation-final head.

- [ ] **Step 6: Verify post-merge `main`**

Confirm protected `main` equals the squash SHA and post-merge Repository Baseline, Runtime and Contracts, CodeQL, Cross-platform Packaging and Public Alpha validation all pass.

- [ ] **Step 7: Commission `v0.1.0-alpha.1` through the governed manual workflow when tool authority permits**

The release workflow must create the tag itself after validating `main`, then create the GitHub prerelease and attach three package tarballs, `release-manifest.json` and `SHA256SUMS` plus release notes. Do not enable npm publication unless trusted-publishing/environment authority is actually configured.

If the available GitHub connector cannot dispatch a workflow or configure the protected npm environment, report that exact external authority boundary; do not create an ad hoc tag/release outside the governed workflow.

- [ ] **Step 8: Verify release object and attached evidence**

Verify tag/version/source SHA agree, release is `prerelease`, artifacts match manifest/checksums, and release notes preserve alpha/known-limitations language.

- [ ] **Step 9: Commit/merge conclusion**

Phase 10 is complete only after the merged `main` gates are green and the governed GitHub alpha is commissioned, or after all repository work is complete and the only remaining blocker is an explicitly identified external release-dispatch authority that cannot be exercised from this chat.
