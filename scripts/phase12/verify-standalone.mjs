import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.json', '.js', '.mjs', '.ts', '.md', '.yml', '.yaml']);
const ACTIVE_FILES = [
  'README.md', 'package.json',
  'docs/index.md', 'docs/deployment.md', 'docs/desktop-control.md',
  'docs/browser-control.md', 'docs/model-transport.md', 'docs/agent-cli-adapters.md',
  'docs/known-limitations.md', 'docs/public-alpha.md', 'docs/roadmap.md',
  'docs/product-usability.md',
];
const ACTIVE_DIRECTORIES = [
  'packages', 'connectors', '.github/workflows', 'scripts/release', 'examples',
];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function walk(path, output) {
  if (!await exists(path)) return;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', '.git', '.superpowers'].includes(entry.name)) continue;
    const candidate = join(path, entry.name);
    if (entry.isDirectory()) await walk(candidate, output);
    else if (TEXT_EXTENSIONS.has(extname(entry.name)) || entry.name === 'package.json') output.add(candidate);
  }
}
function finding(file, reason) {
  return { file, reason };
}

function inspectText(file, text) {
  const findings = [];
  if (/@quoralinex\/q1x-(?:control-plane|sovereign(?:-orchestrator)?|internal[\w-]*)/i.test(text)) {
    findings.push(finding(file, 'Private package dependency or package reference is present.'));
  }
  if (/https?:\/\/[^\s"'`]*(?:control-plane|sovereign-orchestrator)[^\s"'`]*/i.test(text)) {
    findings.push(finding(file, 'Private service endpoint is present in an active product surface.'));
  }
  if (/\bQ1X_(?:CONTROL_PLANE|AUTHORITY|CONTINUITY|CAPSULE)(?:_[A-Z0-9_]+)?\b/.test(text)) {
    findings.push(finding(file, 'Reserved private environment key is present in an active product surface.'));
  }
  if (/\b(?:authority|continuity|capsule)Callback\b/.test(text)) {
    findings.push(finding(file, 'Private callback integration is present in an active product surface.'));
  }
  if (file.includes('connectors/') && /"id"\s*:\s*"(?:q1x\.(?:control-plane|sovereign)|quoralinex\.private[^"]*)"/i.test(text)) {
    findings.push(finding(file, 'Private connector profile is present in the built-in connector surface.'));
  }
  return findings;
}

export async function verifyStandaloneRoot(root) {
  const absoluteRoot = resolve(root);
  const files = new Set();
  for (const path of ACTIVE_FILES) {
    const candidate = join(absoluteRoot, path);
    if (await exists(candidate)) files.add(candidate);
  }
  for (const path of ACTIVE_DIRECTORIES) await walk(join(absoluteRoot, path), files);

  const findings = [];
  for (const path of [...files].sort()) {
    const file = relative(absoluteRoot, path).replaceAll('\\', '/');
    const text = await readFile(path, 'utf8');
    findings.push(...inspectText(file, text));
  }
  return {
    schema: 'q1x.phase12-standalone-verification.v1',
    ok: findings.length === 0,
    scannedFiles: files.size,
    findings,
  };
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedFile && pathToFileURL(invokedFile).href === import.meta.url) {
  const repositoryRoot = resolve(dirname(thisFile), '../..');
  const report = await verifyStandaloneRoot(repositoryRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
