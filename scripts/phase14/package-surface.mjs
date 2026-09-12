import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PUBLIC_PACKAGES, SUPPORTED_RELEASE_VERSIONS } from '../release/release-metadata.mjs';
import { validatePackedManifest } from '../release/verify-packed-consumer.mjs';

const root = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const tarCommand = process.platform === 'win32' ? 'tar.exe' : 'tar';
const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableObject(item)]));
}
function normalizeMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? stableObject(value) : null;
}
function inventoryFor(inventory, packageName) {
  const entry = inventory.find(item => item.packageName === packageName);
  if (!entry || !Array.isArray(entry.files)) throw new Error(`Missing packed-file inventory for ${packageName}`);
  return entry.files.map(item => item.path).sort();
}

export function buildPackageSurface({ packageManifests, inventory, governedVersion }) {
  if (!SUPPORTED_RELEASE_VERSIONS.includes(governedVersion)) throw new Error(`Unsupported governed release version: ${governedVersion}`);
  const manifestsByName = new Map(packageManifests.map(item => [item.name, item]));
  const packages = PUBLIC_PACKAGES.map(([name]) => {
    const pkg = manifestsByName.get(name);
    if (!pkg) throw new Error(`Missing packed package manifest for ${name}`);
    const internalDependencies = Object.entries(pkg.dependencies ?? {})
      .filter(([dependency]) => publicNames.has(dependency))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dependency, version]) => {
        if (version !== governedVersion) throw new Error(`Package ${name} must use exact governed dependency ${dependency}@${governedVersion}`);
        return { name: dependency, versionPolicy: 'exact-governed-release' };
      });
    return {
      name,
      exports: normalizeMap(pkg.exports),
      bin: normalizeMap(pkg.bin),
      nodeEngine: typeof pkg.engines?.node === 'string' ? pkg.engines.node : null,
      license: typeof pkg.license === 'string' ? pkg.license : null,
      internalDependencies,
      files: inventoryFor(inventory, name),
    };
  });
  return { schema: 'q1x.phase14-package-surface.v1', packages };
}

export function comparePackageSurface(baseline, current) {
  const findings = [];
  if (baseline?.schema !== 'q1x.phase14-package-surface.v1' || current?.schema !== baseline.schema) {
    findings.push({ code: 'schema.changed', detail: 'package-surface schema changed' });
  }
  const baselineByName = new Map((baseline?.packages ?? []).map(item => [item.name, item]));
  const currentByName = new Map((current?.packages ?? []).map(item => [item.name, item]));
  for (const [name, expected] of baselineByName) {
    const actual = currentByName.get(name);
    if (!actual) findings.push({ code: 'package.removed', detail: `package removed: ${name}` });
    else if (JSON.stringify(expected) !== JSON.stringify(actual)) findings.push({ code: 'package.changed', detail: `package surface changed: ${name}` });
  }
  for (const name of currentByName.keys()) if (!baselineByName.has(name)) findings.push({ code: 'package.added', detail: `unexpected governed package added: ${name}` });
  return { ok: findings.length === 0, findings };
}

function extractPackageJson(tarball) {
  const output = execFileSync(tarCommand, ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output);
}
export async function collectPackageSurface(artifactsInput) {
  const artifacts = isAbsolute(artifactsInput) ? artifactsInput : resolve(root, artifactsInput);
  const manifest = JSON.parse(await readFile(join(artifacts, 'release-manifest.json'), 'utf8'));
  validatePackedManifest(manifest);
  const inventory = JSON.parse(await readFile(join(artifacts, 'package-inventory.json'), 'utf8'));
  const packageManifests = manifest.artifacts.map(artifact => extractPackageJson(join(artifacts, artifact.filename)));
  return buildPackageSurface({ packageManifests, inventory, governedVersion: manifest.version });
}
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const artifacts = arg('--artifacts');
  if (!artifacts) throw new Error('--artifacts <directory> is required');
  const surface = await collectPackageSurface(artifacts);
  const write = arg('--write');
  const check = arg('--check');
  if (write && check) throw new Error('Use only one of --write or --check');
  if (write) {
    await writeFile(resolve(write), `${JSON.stringify(surface, null, 2)}\n`);
  } else if (check) {
    const baseline = JSON.parse(await readFile(resolve(check), 'utf8'));
    const result = comparePackageSurface(baseline, surface);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(surface, null, 2)}\n`);
  }
}
