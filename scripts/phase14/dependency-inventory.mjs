import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_PACKAGES } from '../release/release-metadata.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function packageNameFromLockPath(path) {
  const match = String(path).match(/(?:^|\/)node_modules\/(@[^/]+\/[^/]+|[^/]+)$/);
  return match?.[1];
}
function licenseText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof value.type === 'string' && value.type.trim()) return value.type.trim();
  return undefined;
}
export async function buildDependencyInventory(rootInput) {
  const root = resolve(rootInput);
  const lockBytes = await readFile(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const licenseByIdentity = new Map();
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    const name = packageNameFromLockPath(path);
    if (!name || typeof entry?.version !== 'string') continue;
    const license = licenseText(entry.license);
    if (license) licenseByIdentity.set(`${name}@${entry.version}`, license);
  }

  const tree = JSON.parse(execFileSync(npmCommand, ['ls', '--omit=dev', '--all', '--json'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const publicNames = new Set(PUBLIC_PACKAGES.map(([name]) => name));
  const records = new Map();
  function visit(name, node, depthFromPublic) {
    if (!node || typeof node.version !== 'string') throw new Error(`Production dependency ${name} has no resolved version`);
    if (!publicNames.has(name)) {
      const identity = `${name}@${node.version}`;
      const license = licenseByIdentity.get(identity);
      if (!license) throw new Error(`Production dependency ${identity} has no declared licence in package-lock.json`);
      const relationship = depthFromPublic === 1 ? 'direct' : 'transitive';
      const previous = records.get(identity);
      if (!previous || (previous.relationship === 'transitive' && relationship === 'direct')) {
        records.set(identity, { name, version: node.version, license, relationship });
      }
    }
    for (const [dependencyName, dependency] of Object.entries(node.dependencies ?? {})) {
      visit(dependencyName, dependency, publicNames.has(name) ? 1 : depthFromPublic + 1);
    }
  }
  for (const [name, node] of Object.entries(tree.dependencies ?? {})) {
    if (!publicNames.has(name)) continue;
    visit(name, node, 0);
  }

  const publicPackages = [];
  for (const [name, directory] of PUBLIC_PACKAGES) {
    const pkg = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'));
    const license = licenseText(pkg.license);
    if (!license) throw new Error(`Public package ${name} has no declared licence`);
    publicPackages.push({ name, version: pkg.version, license });
  }
  return {
    schema: 'q1x.phase14-dependency-inventory.v1',
    lockfileSha256: createHash('sha256').update(lockBytes).digest('hex'),
    publicPackages,
    packages: [...records.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)),
    externalProviderCalls: 0,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await buildDependencyInventory(process.cwd());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
