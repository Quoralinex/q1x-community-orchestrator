import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
const fullShaActions = workflow => [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(match => match[1]);

function assertPinnedActions(workflow) {
  const refs = fullShaActions(workflow);
  assert.ok(refs.length >= 3);
  for (const ref of refs) assert.match(ref, /@[0-9a-f]{40}$/);
}

test('stable readiness workflow is read-only by default and has manual long-evidence jobs', async () => {
  const workflow = await text('.github/workflows/stable-readiness.yml');
  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /node-version:\s*['"]?24/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /test:compatibility/);
  assert.match(workflow, /test:resilience/);
  assert.match(workflow, /test:stress/);
  assert.match(workflow, /test:surface|public-surface\.mjs/);
  assert.match(workflow, /run-upgrade-matrix\.mjs/);
  assert.match(workflow, /run-restart-campaign\.mjs[^\n]*--cycles\s+25/);
  assert.match(workflow, /prepare-prerelease\.mjs[^\n]*1\.0\.0-rc\.1/);
  assert.match(workflow, /verify-packed-consumer\.mjs/);
  assert.match(workflow, /verify-reproducible-packages\.mjs[^\n]*1\.0\.0-rc\.1/);
  assert.match(workflow, /dependency-inventory\.mjs/);
  assert.match(workflow, /restart-campaign:/);
  assert.match(workflow, /--cycles\s+1000/);
  assert.match(workflow, /soak:/);
  assert.match(workflow, /timeout-minutes:\s*390/);
  assert.match(workflow, /--minutes\s+360/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|Q1X_CONTROL_PLANE|secrets\./i);
  assertPinnedActions(workflow);
});

test('workflows executing Phase 14 completion fetch the historical acceptance commits', async () => {
  const workflows = [
    '.github/workflows/repository-baseline.yml',
    '.github/workflows/stable-readiness.yml',
    '.github/workflows/beta-readiness.yml',
    '.github/workflows/public-alpha.yml',
    '.github/workflows/public-beta.yml',
    '.github/workflows/public-stable.yml',
  ];
  for (const path of workflows) {
    const workflow = await text(path);
    const commandIndex = Math.min(
      ...['npm run check', 'npm run verify:phase14']
        .map(command => workflow.indexOf(command))
        .filter(index => index >= 0),
    );
    assert.ok(Number.isFinite(commandIndex), `${path} must execute a Phase 14-capable verification command`);
    const setup = workflow.slice(0, commandIndex);
    assert.match(
      setup,
      /uses:\s*actions\/checkout@[0-9a-f]{40}[^]*?with:\s*\n\s*fetch-depth:\s*0/,
      `${path} must fetch full Git history before runtime-equivalence verification`,
    );
  }
});

test('beta workflows use the governed reproducibility CLI contract', async () => {
  const betaReadiness = await text('.github/workflows/beta-readiness.yml');
  const publicBeta = await text('.github/workflows/public-beta.yml');
  assert.match(
    betaReadiness,
    /verify-reproducible-packages\.mjs\s+--version\s+0\.2\.0-beta\.1\s+--source-sha\s+"\$sha"/,
  );
  assert.match(
    publicBeta,
    /verify-reproducible-packages\.mjs\s+--version\s+0\.2\.0-beta\.1\s+--source-sha\s+"\$GITHUB_SHA"/,
  );
});

test('public stable workflow separates validation release and npm mutation authority', async () => {
  const workflow = await text('.github/workflows/public-stable.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /version:/);
  assert.match(workflow, /default:\s*['"]?1\.0\.0/);
  assert.match(workflow, /release:/);
  assert.match(workflow, /publish_npm:/);
  assert.match(workflow, /default:\s*false/);
  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /node-version:\s*['"]?24/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /prepare-prerelease\.mjs[^\n]*--version\s+1\.0\.0/);
  assert.match(workflow, /verify-packed-consumer\.mjs/);
  assert.match(workflow, /verify-reproducible-packages\.mjs[^\n]*--version\s+1\.0\.0/);
  assert.match(workflow, /dependency-inventory\.mjs/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=critical --json/);
  assert.match(workflow, /stable-vulnerability-audit\.json/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /inputs\.release == true/);
  assert.match(workflow, /inputs\.version == '1\.0\.0'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /REMOTE_MAIN/);
  assert.match(workflow, /git\/ref\/tags\/\$\{TAG\}|git\/ref\/tags\/\$TAG/);
  assert.match(workflow, /gh release view/);
  assert.match(workflow, /actions\/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a/);
  assert.match(workflow, /environment:\s*npm-public-stable/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /inputs\.publish_npm == true/);
  assert.match(workflow, /npm publish --provenance --access public/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|Q1X_CONTROL_PLANE/i);
  assertPinnedActions(workflow);
});

test('repository baseline includes Phase 14 completion verification after retained long evidence exists', async () => {
  const baseline = await text('.github/workflows/repository-baseline.yml');
  assert.match(baseline, /phase14-workflows\.test\.mjs/);
  assert.match(baseline, /release-stable-governance\.test\.mjs/);
  assert.match(baseline, /npm run verify:phase14/);
});
