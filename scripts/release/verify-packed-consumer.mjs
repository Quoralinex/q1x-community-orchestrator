import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BETA_VERSION, PUBLIC_PACKAGES, RC_VERSION, RELEASE_VERSION, STABLE_VERSION, sha256File } from './release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const publicPackageNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));

function valueFor(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function readManifest(directory) {
  const path = join(directory, 'release-manifest.json');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read release-manifest.json from ${directory}: ${error.message}`);
  }
}

export function validatePackedManifest(manifest) {
  const expectedVersion = manifest?.status === 'public-alpha'
    ? RELEASE_VERSION
    : manifest?.status === 'beta-candidate'
      ? BETA_VERSION
      : manifest?.status === 'stable-rc-candidate'
        ? RC_VERSION
        : manifest?.status === 'stable'
          ? STABLE_VERSION
          : undefined;
  if (!expectedVersion) throw new Error('Release manifest status must be public-alpha, beta-candidate, stable-rc-candidate or stable');
  if (manifest?.version !== expectedVersion) throw new Error(`Release manifest version must be ${expectedVersion}`);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== PUBLIC_PACKAGES.length) {
    throw new Error(`Release manifest must contain exactly ${PUBLIC_PACKAGES.length} package artifacts`);
  }
  const expectedNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  const actualNames = new Set(manifest.artifacts.map(artifact => artifact.packageName));
  if (actualNames.size !== expectedNames.size || [...expectedNames].some(name => !actualNames.has(name))) {
    throw new Error('Release manifest package artifact set does not match the public package set');
  }
}

async function packageName(directory) {
  try {
    return JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).name;
  } catch {
    return undefined;
  }
}

async function localThirdPartyPackageDirectories() {
  const modules = join(root, 'node_modules');
  const directories = [];
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (entry.name === '.bin' || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
    const entryPath = join(modules, entry.name);
    if (entry.name.startsWith('@')) {
      for (const scoped of await readdir(entryPath, { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue;
        const scopedPath = join(entryPath, scoped.name);
        const name = await packageName(scopedPath);
        if (name && !publicPackageNames.has(name)) directories.push(scopedPath);
      }
      continue;
    }
    const name = await packageName(entryPath);
    if (name && !publicPackageNames.has(name)) directories.push(entryPath);
  }
  return directories.sort();
}

export async function verifyPackedConsumer(artifactsDirectory) {
  const directory = isAbsolute(artifactsDirectory) ? artifactsDirectory : resolve(root, artifactsDirectory);
  const manifest = await readManifest(directory);
  validatePackedManifest(manifest);

  const tarballs = [];
  for (const artifact of manifest.artifacts) {
    const path = join(directory, artifact.filename);
    const digest = await sha256File(path);
    if (digest !== artifact.sha256) throw new Error(`SHA-256 mismatch for release artifact ${artifact.filename}`);
    tarballs.push(path);
  }

  const consumer = await mkdtemp(join(tmpdir(), 'q1x-packed-consumer-'));
  const home = join(consumer, 'runtime-home');
  try {
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'q1x-release-consumer', private: true, type: 'module' }, null, 2));
    const thirdPartyPackages = await localThirdPartyPackageDirectories();
    if (thirdPartyPackages.length === 0) throw new Error('No locally installed third-party packages are available for offline consumer verification');
    run(npmCommand, [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--install-links=true',
      ...thirdPartyPackages,
      ...tarballs
    ], consumer);

    run(process.execPath, [
      '--input-type=module',
      '--eval',
      [
        "import * as sdk from '@quoralinex/q1x-community-sdk';",
        "import * as adapterSdk from '@quoralinex/q1x-community-adapter-sdk';",
        "import * as runtime from '@quoralinex/q1x-community-runtime';",
        "const adapter = { protocol: 'consumer.echo', compatibility: adapterSdk.createAdapterCompatibility(), async execute(_endpoint, request) { return { contractVersion: '1.0.0', id: 'result.consumer.echo', requestId: request.id, workItemId: request.workItemId, status: 'succeeded', startedAt: request.createdAt, finishedAt: request.createdAt }; } };",
        "if (!sdk || !runtime || !adapterSdk.validateCommunityAdapter(adapter).ok) process.exit(1);"
      ].join(' ')
    ], consumer);

    const typeSmoke = join(consumer, 'consumer.ts');
    await writeFile(typeSmoke, [
      "import type { AuditVerification } from '@quoralinex/q1x-community-sdk';",
      "import type { CommunityAdapter } from '@quoralinex/q1x-community-adapter-sdk';",
      "const verification: AuditVerification = { valid: true, checked: 0 };",
      "declare const adapter: CommunityAdapter;",
      'void verification;',
      'void adapter;',
      ''
    ].join('\n'));
    run(process.execPath, [
      join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--target', 'ES2022',
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      typeSmoke
    ], consumer);

    const cli = join(consumer, 'node_modules', '@quoralinex', 'q1x-community-runtime', 'dist', 'cli.js');
    const initialized = JSON.parse(run(process.execPath, [cli, '--home', home, 'init'], consumer));
    if (initialized.contractVersion !== '1.0.0') throw new Error('Packed q1x CLI did not return contractVersion 1.0.0');

    const connectors = JSON.parse(run(process.execPath, [cli, '--home', home, 'connectors', 'list'], consumer));
    if (!Array.isArray(connectors) || connectors.length === 0) throw new Error('Packed q1x CLI did not expose the connector catalogue');
    const doctor = JSON.parse(run(process.execPath, [cli, '--home', home, 'doctor', '--json'], consumer));
    if (doctor.contractVersion !== '1.0.0' || typeof doctor.state !== 'string') throw new Error('Packed q1x doctor did not return a valid report');

    const bridgeDoctors = {};
    for (const platform of ['macos', 'windows', 'linux']) {
      const bridge = join(consumer, 'node_modules', '@quoralinex', `q1x-community-desktop-bridge-${platform}`, 'dist', 'index.js');
      const report = JSON.parse(run(process.execPath, [bridge, '--doctor'], consumer));
      if (report.protocol !== 'q1x-desktop-bridge/1' || report.platform !== platform) {
        throw new Error(`Packed ${platform} desktop bridge doctor returned an invalid report`);
      }
      bridgeDoctors[platform] = report.state;
    }

    return {
      version: manifest.version,
      sourceSha: manifest.sourceSha,
      artifacts: manifest.artifacts.map(artifact => artifact.filename),
      contractVersion: initialized.contractVersion,
      connectorCount: connectors.length,
      doctorState: doctor.state,
      bridgeDoctors
    };
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await verifyPackedConsumer(valueFor('--artifacts'));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
