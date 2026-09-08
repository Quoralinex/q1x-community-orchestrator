import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PACKAGES, RELEASE_VERSION, sha256File } from './release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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

function validateManifestShape(manifest) {
  if (manifest?.status !== 'public-alpha') throw new Error('Release manifest status must be public-alpha');
  if (manifest?.version !== RELEASE_VERSION) throw new Error(`Release manifest version must be ${RELEASE_VERSION}`);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== PUBLIC_PACKAGES.length) {
    throw new Error('Release manifest must contain exactly three package artifacts');
  }
  const expectedNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  const actualNames = new Set(manifest.artifacts.map(artifact => artifact.packageName));
  if (actualNames.size !== expectedNames.size || [...expectedNames].some(name => !actualNames.has(name))) {
    throw new Error('Release manifest package artifact set does not match the public package set');
  }
}

export async function verifyPackedConsumer(artifactsDirectory) {
  const directory = isAbsolute(artifactsDirectory) ? artifactsDirectory : resolve(root, artifactsDirectory);
  const manifest = await readManifest(directory);
  validateManifestShape(manifest);

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
    run(npmCommand, [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      ...tarballs
    ], consumer);

    run(process.execPath, [
      '--input-type=module',
      '--eval',
      "import * as sdk from '@quoralinex/q1x-community-sdk'; import * as runtime from '@quoralinex/q1x-community-runtime'; if (!sdk || !runtime) process.exit(1);"
    ], consumer);

    const typeSmoke = join(consumer, 'consumer.ts');
    await writeFile(typeSmoke, [
      "import type { AuditVerification } from '@quoralinex/q1x-community-sdk';",
      "const verification: AuditVerification = { valid: true, checked: 0 };",
      'void verification;',
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

    return {
      version: manifest.version,
      sourceSha: manifest.sourceSha,
      artifacts: manifest.artifacts.map(artifact => artifact.filename),
      contractVersion: initialized.contractVersion
    };
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await verifyPackedConsumer(valueFor('--artifacts'));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
