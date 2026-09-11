import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BETA_VERSION, PUBLIC_PACKAGES } from './release-metadata.mjs';
import { preparePrerelease } from './prepare-prerelease.mjs';

function sameInventory(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function verifyReproduciblePackages({ root: rootInput, version = BETA_VERSION, sourceSha }) {
  const root = resolve(rootInput);
  const temporary = await mkdtemp(join(tmpdir(), 'q1x-reproducible-'));
  try {
    const first = await preparePrerelease({ root, output: join(temporary, 'first'), version, sourceSha });
    const second = await preparePrerelease({ root, output: join(temporary, 'second'), version, sourceSha });
    const packages = PUBLIC_PACKAGES.map(([packageName]) => {
      const left = first.artifacts.find(item => item.packageName === packageName);
      const right = second.artifacts.find(item => item.packageName === packageName);
      if (!left || !right) throw new Error(`Missing governed package evidence for ${packageName}`);
      return {
        packageName,
        inventoryMatch: sameInventory(left.inventory, right.inventory),
        archiveByteMatch: left.sha256 === right.sha256,
        firstSha256: left.sha256,
        secondSha256: right.sha256,
      };
    });
    return {
      schema: 'q1x.release-reproducibility.v1',
      sourceSha,
      version,
      reproducible: packages.every(item => item.inventoryMatch),
      packages,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.cwd());
  const sourceSha = process.argv[2] ?? '0'.repeat(40);
  const result = await verifyReproduciblePackages({ root, version: BETA_VERSION, sourceSha });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.reproducible) process.exitCode = 1;
}
