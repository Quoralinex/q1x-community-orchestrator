import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertReleaseIdentity,
  buildReleaseManifest,
  formatChecksums,
  readReleaseIdentity,
  sha256File
} from './release-metadata.mjs';

const root = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function valueFor(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runNpm(args) {
  return execFileSync(npmCommand, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

export async function prepareAlpha({ output, sourceSha }) {
  if (!output) throw new Error('Release output directory is required');
  const outputDirectory = isAbsolute(output) ? output : resolve(root, output);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const identity = assertReleaseIdentity(await readReleaseIdentity(root));
  runNpm(['run', 'build']);

  const artifacts = [];
  for (const packageInfo of identity.packages) {
    const result = JSON.parse(runNpm([
      'pack',
      '--workspace', packageInfo.directory,
      '--pack-destination', outputDirectory,
      '--json'
    ]));
    const packed = result[0];
    if (!packed?.filename) throw new Error(`npm pack did not return a filename for ${packageInfo.name}`);
    const artifactPath = join(outputDirectory, packed.filename);
    artifacts.push({
      filename: packed.filename,
      packageName: packageInfo.name,
      version: packageInfo.version,
      sha256: await sha256File(artifactPath)
    });
  }

  const manifest = buildReleaseManifest({
    identity,
    sourceSha,
    artifacts,
    generatedAt: new Date().toISOString()
  });
  await writeFile(join(outputDirectory, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outputDirectory, 'SHA256SUMS'), formatChecksums(artifacts));
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const manifest = await prepareAlpha({
    output: valueFor('--output'),
    sourceSha: valueFor('--source-sha')
  });
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}
