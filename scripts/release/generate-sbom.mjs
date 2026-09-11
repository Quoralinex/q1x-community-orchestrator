import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_PACKAGES } from './release-metadata.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function packageName(path, entry) {
  if (entry.name) return entry.name;
  const marker = 'node_modules/';
  const index = path.lastIndexOf(marker);
  if (index < 0) return undefined;
  const tail = path.slice(index + marker.length).split('/');
  return tail[0]?.startsWith('@') ? tail.slice(0, 2).join('/') : tail[0];
}

function spdxId(path) {
  return `SPDXRef-Package-${digest(path).slice(0, 20)}`;
}

function licence(entry, publicName) {
  if (publicName) return 'LicenseRef-PolyForm-Noncommercial-1.0.0';
  const value = entry.license;
  return typeof value === 'string' && /^[A-Za-z0-9.+() -]+$/.test(value) ? value : 'NOASSERTION';
}
export async function generateSbom(rootInput, { publicVersion } = {}) {
  const root = resolve(rootInput);
  const lockText = await readFile(join(root, 'package-lock.json'), 'utf8');
  const lock = JSON.parse(lockText);
  const publicByPath = new Map(PUBLIC_PACKAGES.map(([name, path]) => [path, name]));
  const records = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path) continue;
    const name = packageName(path, entry);
    const publicName = publicByPath.get(path);
    if (!name && !publicName) continue;
    if (!entry.version && !publicName) continue;
    records.push({
      path,
      name: publicName ?? name,
      version: publicName && publicVersion ? publicVersion : (entry.version ?? '0.1.0-alpha.2'),
      license: licence(entry, publicName),
      dependencies: { ...(entry.dependencies ?? {}) },
      SPDXID: spdxId(path),
    });
  }
  const byName = new Map();
  for (const record of records) if (!byName.has(record.name)) byName.set(record.name, record);
  const packages = records.map(record => ({
    SPDXID: record.SPDXID,
    name: record.name,
    versionInfo: record.version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: record.license,
    licenseDeclared: record.license,
    sourcePath: record.path,
  }));
  const relationships = [];
  for (const record of records) {
    for (const dependencyName of Object.keys(record.dependencies)) {
      const dependency = byName.get(dependencyName);
      if (!dependency) continue;
      relationships.push({
        spdxElementId: record.SPDXID,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: dependency.SPDXID,
      });
    }
  }
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'Q1X Community Orchestrator',
    documentNamespace: `https://q1x.xyz/spdx/q1x-community-orchestrator/${digest(lockText)}`,
    creationInfo: {
      created: new Date(0).toISOString(),
      creators: ['Organization: Quoralinex'],
    },
    packages,
    relationships,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  const sbom = await generateSbom(root);
  if (output) await writeFile(output, `${JSON.stringify(sbom, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(sbom, null, 2)}\n`);
}
