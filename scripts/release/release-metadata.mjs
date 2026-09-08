import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const RELEASE_VERSION = '0.1.0-alpha.1';
export const RELEASE_TAG = `v${RELEASE_VERSION}`;
export const PUBLIC_PACKAGES = [
  ['@quoralinex/q1x-community-contracts', 'packages/contracts'],
  ['@quoralinex/q1x-community-sdk', 'packages/sdk-typescript'],
  ['@quoralinex/q1x-community-runtime', 'packages/runtime']
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function readReleaseIdentity(root) {
  const rootPackage = await readJson(join(root, 'package.json'));
  const packages = [];
  for (const [expectedName, directory] of PUBLIC_PACKAGES) {
    const packageJson = await readJson(join(root, directory, 'package.json'));
    packages.push({
      name: packageJson.name,
      expectedName,
      version: packageJson.version,
      directory,
      dependencies: { ...(packageJson.dependencies ?? {}) }
    });
  }
  return {
    version: packages[0]?.version,
    tag: `v${packages[0]?.version}`,
    rootPrivate: rootPackage.private === true,
    packages
  };
}

export function assertReleaseIdentity(identity) {
  if (!identity.rootPrivate) throw new Error('Root workspace must remain private and non-publishable');
  if (identity.version !== RELEASE_VERSION) throw new Error(`Release version must be exactly ${RELEASE_VERSION}`);
  if (identity.tag !== RELEASE_TAG) throw new Error(`Release tag must be exactly ${RELEASE_TAG}`);
  if (!Array.isArray(identity.packages) || identity.packages.length !== PUBLIC_PACKAGES.length) {
    throw new Error('Release package set must contain exactly the three public Q1X packages');
  }

  for (let index = 0; index < PUBLIC_PACKAGES.length; index += 1) {
    const [expectedName, expectedDirectory] = PUBLIC_PACKAGES[index];
    const packageInfo = identity.packages[index];
    if (packageInfo?.name !== expectedName || packageInfo?.directory !== expectedDirectory) {
      throw new Error(`Release package set mismatch at position ${index + 1}`);
    }
    if (packageInfo.version !== RELEASE_VERSION) {
      throw new Error(`Package ${packageInfo.name} must use release version ${RELEASE_VERSION}`);
    }
  }

  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  for (const packageInfo of identity.packages) {
    for (const [dependency, version] of Object.entries(packageInfo.dependencies ?? {})) {
      if (publicNames.has(dependency) && version !== RELEASE_VERSION) {
        throw new Error(`Package ${packageInfo.name} must use exact internal dependency ${dependency}@${RELEASE_VERSION}`);
      }
    }
  }

  return identity;
}
