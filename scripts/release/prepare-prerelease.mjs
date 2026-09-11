import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BETA_VERSION,
  PUBLIC_PACKAGES,
  assertReleaseIdentity,
  buildReleaseManifest,
  formatChecksums,
  readReleaseIdentity,
  sha256File,
} from './release-metadata.mjs';
import { generateSbom } from './generate-sbom.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tarCommand = process.platform === 'win32' ? 'tar.exe' : 'tar';

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function copyTrackedSnapshot(root, target) {
  const files = run('git', ['ls-files', '-z'], root).split('\0').filter(Boolean);
  for (const name of files) {
    const source = join(root, name);
    const destination = join(target, name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { dereference: false });
  }
}

async function stagePackageVersions(root, version) {
  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  for (const [, directory] of PUBLIC_PACKAGES) {
    const path = join(root, directory, 'package.json');
    const pkg = JSON.parse(await readFile(path, 'utf8'));
    pkg.version = version;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (!pkg[section]) continue;
      for (const name of Object.keys(pkg[section])) {
        if (publicNames.has(name)) pkg[section][name] = version;
      }
    }
    await writeJson(path, pkg);
  }
}

async function walkFiles(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await walkFiles(root, path, output);
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
async function inventoryDirectory(root) {
  const files = await walkFiles(root);
  const inventory = [];
  for (const path of files.sort()) {
    const info = await stat(path);
    inventory.push({
      path: relative(root, path).replaceAll('\\', '/'),
      size: info.size,
      sha256: await sha256File(path),
    });
  }
  return inventory;
}

async function packPackage(snapshot, packageInfo, outputDirectory, extractionRoot) {
  const result = JSON.parse(run(npmCommand, [
    'pack', '--workspace', packageInfo.directory,
    '--pack-destination', outputDirectory, '--json',
  ], snapshot));
  const packed = result[0];
  if (!packed?.filename) throw new Error(`npm pack did not return a filename for ${packageInfo.name}`);
  const artifactPath = join(outputDirectory, packed.filename);
  const extraction = join(extractionRoot, packageInfo.name.replaceAll('/', '__'));
  await mkdir(extraction, { recursive: true });
  run(tarCommand, ['-xzf', artifactPath, '-C', extraction], snapshot);
  const packageRoot = join(extraction, 'package');
  return {
    filename: packed.filename,
    packageName: packageInfo.name,
    version: packageInfo.version,
    sha256: await sha256File(artifactPath),
    inventory: await inventoryDirectory(packageRoot),
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
export async function preparePrerelease({
  root: rootInput,
  output: outputInput,
  version = BETA_VERSION,
  sourceSha,
  compatibilityEvidenceBaseline = sourceSha,
  resilienceEvidenceBaseline = sourceSha,
}) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) throw new Error('A 40-character source SHA is required');
  const root = resolve(rootInput);
  const outputDirectory = resolve(outputInput);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const temporaryRoot = await mkdtemp(join(dirname(outputDirectory), '.q1x-prerelease-'));
  const snapshot = join(temporaryRoot, 'source');
  const extractionRoot = join(temporaryRoot, 'extract');
  await mkdir(snapshot, { recursive: true });
  await mkdir(extractionRoot, { recursive: true });

  try {
    await copyTrackedSnapshot(root, snapshot);
    run(npmCommand, ['ci', '--no-audit', '--no-fund'], snapshot);
    await stagePackageVersions(snapshot, version);
    run(npmCommand, ['run', 'build'], snapshot);
    const identity = assertReleaseIdentity(await readReleaseIdentity(snapshot), { version });
    const artifacts = [];
    for (const packageInfo of identity.packages) {
      artifacts.push(await packPackage(snapshot, packageInfo, outputDirectory, extractionRoot));
    }
    const lockfileSha256 = await sha256File(join(snapshot, 'package-lock.json'));
    const npmVersion = run(npmCommand, ['--version'], snapshot);
    const manifest = buildReleaseManifest({
      identity, sourceSha, artifacts, generatedAt: new Date().toISOString(), version,
      nodeVersion: process.version.replace(/^v/, ''), npmVersion, lockfileSha256,
      compatibilityEvidenceBaseline, resilienceEvidenceBaseline,
    });
    const sbom = await generateSbom(snapshot, { publicVersion: version });
    const inventory = artifacts.map(item => ({ packageName: item.packageName, files: item.inventory }));
    await writeJson(join(outputDirectory, 'release-manifest.json'), manifest);
    await writeFile(join(outputDirectory, 'SHA256SUMS'), formatChecksums(artifacts, { version }));
    await writeJson(join(outputDirectory, 'package-inventory.json'), inventory);
    await writeJson(join(outputDirectory, `q1x-community-orchestrator-${version}.spdx.json`), sbom);
    return { manifest, artifacts, sbom, inventory, outputDirectory };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(arg('--root') ?? dirname(fileURLToPath(new URL('../../package.json', import.meta.url))));
  const output = resolve(arg('--output') ?? join(root, '.release-beta'));
  const sourceSha = arg('--source-sha') ?? run('git', ['rev-parse', 'HEAD'], root);
  const result = await preparePrerelease({ root, output, sourceSha, version: arg('--version') ?? BETA_VERSION });
  process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
}
