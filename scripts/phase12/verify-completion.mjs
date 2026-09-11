import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyStandaloneRoot } from './verify-standalone.mjs';

const RELEASE_VERSION = '0.1.0-alpha.2';
const PACKAGE_DIRS = [
  'contracts', 'sdk-typescript', 'adapter-sdk', 'desktop-bridge-common',
  'desktop-bridge-macos', 'desktop-bridge-windows', 'desktop-bridge-linux', 'runtime',
];
const REQUIRED_CONNECTORS = [
  'desktop.macos.first-party', 'desktop.windows.first-party', 'desktop.linux.first-party',
  'model.openai-chat.local', 'model.openai-responses.local', 'model.anthropic-messages.local',
  'mcp.stdio', 'mcp.streamable-http', 'a2a.jsonrpc', 'cli.json', 'cli.text',
  'browser.chromium.managed', 'browser.chromium.cdp',
];
const REQUIRED_COMPATIBILITY = [
  'desktop.macos.first-party', 'desktop.windows.first-party', 'desktop.linux.first-party',
  'model.openai-chat.local.fixture', 'model.openai-responses.local.fixture',
  'model.anthropic-messages.local.fixture', 'adapter.mcp.stdio.fixture',
  'adapter.mcp.streamable-http.fixture', 'adapter.a2a.jsonrpc.fixture',
  'adapter.cli.json.fixture', 'adapter.cli.text.fixture', 'browser.chromium.managed.runner',
  'protocol.connector-management',
];
const REQUIRED_PROFILE_FILES = [
  'a2a-jsonrpc.json', 'browser-cdp-chromium.json', 'browser-managed-chromium.json',
  'cli-json-stdio.json', 'cli-text-stdio.json', 'mcp-stdio.json',
  'mcp-streamable-http.json', 'model-anthropic-messages-local.json',
  'model-openai-chat-local.json', 'model-openai-responses-local.json',
];

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
}
async function readText(path) {
  try { return await readFile(path, 'utf8'); } catch { return ''; }
}
function add(findings, condition, code, detail) {
  if (!condition) findings.push({ code, detail });
}
function binsFromPackage(packageJson) {
  if (!packageJson?.bin) return [];
  return typeof packageJson.bin === 'string'
    ? [packageJson.name?.split('/').pop()].filter(Boolean)
    : Object.keys(packageJson.bin);
}
export async function verifyPhase12Root(root) {
  const absoluteRoot = resolve(root);
  const findings = [];
  const packageRecords = [];
  const executables = [];

  for (const directory of PACKAGE_DIRS) {
    const path = join(absoluteRoot, 'packages', directory, 'package.json');
    const packageJson = await readJson(path);
    add(findings, Boolean(packageJson), 'package.missing', `Missing or invalid ${path}`);
    if (!packageJson) continue;
    packageRecords.push({ name: packageJson.name, version: packageJson.version, directory });
    executables.push(...binsFromPackage(packageJson));
  }

  const currentPackageVersions = [...new Set(packageRecords.map(item => item.version))];
  add(findings, packageRecords.length === PACKAGE_DIRS.length && currentPackageVersions.length === 1,
    'package.alignment', 'Current public package manifests must remain version-aligned.');

  const catalogue = await readJson(join(absoluteRoot, 'connectors/catalogue.json'));
  const catalogueIds = new Set(Array.isArray(catalogue?.connectors)
    ? catalogue.connectors.map(item => item.id) : []);
  for (const id of REQUIRED_CONNECTORS) {
    add(findings, catalogueIds.has(id), 'connector.missing', `Required connector is absent: ${id}`);
  }
  for (const file of REQUIRED_PROFILE_FILES) {
    add(findings, await exists(join(absoluteRoot, 'connectors/profiles', file)),
      'profile.missing', `Required connector profile is absent: ${file}`);
  }
  const matrix = await readJson(join(absoluteRoot, 'compatibility/matrix.json'));
  const compatibilityIds = Array.isArray(matrix?.entries) ? matrix.entries.map(item => item.id) : [];
  add(findings, matrix?.projectVersion === RELEASE_VERSION, 'compatibility.version',
    `Compatibility matrix projectVersion must be ${RELEASE_VERSION}`);
  add(findings, /^[0-9a-f]{40}$/.test(matrix?.generatedFrom ?? ''), 'compatibility.baseline',
    'Compatibility matrix must record a 40-character evidence baseline commit.');
  for (const id of REQUIRED_COMPATIBILITY) {
    add(findings, compatibilityIds.includes(id), 'compatibility.missing',
      `Required Phase 12 compatibility entry is absent: ${id}`);
  }

  const cli = await readText(join(absoluteRoot, 'packages/runtime/src/cli.ts'));
  const productWorkflow = await readText(join(absoluteRoot, '.github/workflows/product-usability.yml'));
  const crossPlatformWorkflow = await readText(join(absoluteRoot, '.github/workflows/cross-platform-packaging.yml'));
  const baselineWorkflow = await readText(join(absoluteRoot, '.github/workflows/repository-baseline.yml'));
  const publicAlphaWorkflow = await readText(join(absoluteRoot, '.github/workflows/public-alpha.yml'));
  const productDoc = await readText(join(absoluteRoot, 'docs/product-usability.md'));
  const standalonePath = join(absoluteRoot, 'scripts/phase12/verify-standalone.mjs');
  const standalone = await verifyStandaloneRoot(absoluteRoot);

  const requiredSurfaces = {
    doctor: /command\s*===\s*['"]doctor['"]/.test(cli),
    productUsabilityWorkflow: /Phase 12|product usability/i.test(productWorkflow),
    crossPlatformProductGate: /Phase 12 product usability acceptance/i.test(crossPlatformWorkflow)
      && /phase12-product-evidence/i.test(crossPlatformWorkflow),
    productUsabilityDocument: /# Product usability|Phase 12/i.test(productDoc),
    standaloneVerifier: await exists(standalonePath) && standalone.ok,
    releaseGovernance: /v0\.1\.0-alpha\.2/.test(publicAlphaWorkflow)
      && /desktop-bridge-(?:macos|windows|linux)-0\.1\.0-alpha\.2\.tgz/.test(publicAlphaWorkflow),
    repositoryBaseline: /verify:standalone/.test(baselineWorkflow) && /verify:phase12/.test(baselineWorkflow),
  };
  for (const [surface, present] of Object.entries(requiredSurfaces)) {
    add(findings, present, 'surface.missing', `Required Phase 12 surface is incomplete: ${surface}`);
  }
  add(findings, standalone.ok, 'standalone.failed',
    `Standalone verifier reported ${standalone.findings.length} finding(s).`);

  return {
    schema: 'q1x.phase12-completion-verification.v1',
    phase: 12,
    ok: findings.length === 0,
    releaseVersion: RELEASE_VERSION,
    currentPackageVersion: currentPackageVersions.length === 1 ? currentPackageVersions[0] : null,
    ciEvidenceRequired: true,
    compatibilityEvidenceBaseline: matrix?.generatedFrom ?? null,
    packages: packageRecords,
    executables: [...new Set(executables)].sort(),
    connectors: REQUIRED_CONNECTORS.filter(id => catalogueIds.has(id)),
    compatibilityEntries: compatibilityIds,
    requiredSurfaces,
    standalone,
    findings,
  };
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedFile && pathToFileURL(invokedFile).href === import.meta.url) {
  const root = resolve(dirname(thisFile), '../..');
  const report = await verifyPhase12Root(root);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
