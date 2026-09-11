import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { API } from 'typescript/unstable/sync';

import { PUBLIC_PACKAGES } from '../release/release-metadata.mjs';

const builtRoots = new Set();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
}

function normalizeDeclaration(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function ensureBuild(root) {
  if (builtRoots.has(root)) return;
  execFileSync(npmCommand, ['run', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  builtRoots.add(root);
}

async function schemaInventory(root) {
  const directory = join(root, 'packages/contracts/schemas/v1');
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  const output = [];
  for (const name of names) {
    const bytes = await readFile(join(directory, name));
    const document = JSON.parse(bytes.toString('utf8'));
    if (typeof document.$id !== 'string' || !document.$id.startsWith('urn:q1x:community:contracts:v1:')) {
      throw new Error(`Schema ${name} does not have a governed v1 $id`);
    }
    output.push({ id: document.$id, file: `packages/contracts/schemas/v1/${name}`, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return output.sort((left, right) => left.id.localeCompare(right.id));
}

async function packageInventory(root) {
  const output = [];
  for (const [expectedName, directory] of PUBLIC_PACKAGES) {
    const pkg = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'));
    if (pkg.name !== expectedName) throw new Error(`Governed package mismatch: expected ${expectedName}, found ${pkg.name}`);
    output.push({
      name: pkg.name,
      directory,
      exports: canonical(pkg.exports ?? null),
      bin: canonical(pkg.bin ?? null),
      engines: canonical(pkg.engines ?? null),
      license: pkg.license ?? null,
    });
  }
  return output.sort((left, right) => left.name.localeCompare(right.name));
}

function declarationExports(root, packageRecords) {
  const entries = packageRecords.map(pkg => ({
    name: pkg.name,
    entry: resolve(root, pkg.directory, 'dist/index.d.ts'),
  }));
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openFiles: entries.map(item => item.entry) });
    try {
      return entries.map(({ name, entry }) => {
        const project = snapshot.getDefaultProjectForFile(entry);
        if (!project) throw new Error(`No TypeScript project resolved for ${name}`);
        const source = project.program.getSourceFile(entry);
        if (!source) throw new Error(`No declaration source resolved for ${name}`);
        const moduleSymbol = project.checker.getSymbolAtLocation(source);
        if (!moduleSymbol) throw new Error(`No declaration module symbol resolved for ${name}`);
        const exports = project.checker.getExportsOfModule(moduleSymbol).map(symbol => {
          let target = symbol;
          try { target = project.checker.getAliasedSymbol(symbol) ?? symbol; } catch { /* not an alias */ }
          const declaration = target.declarations?.[0]?.resolve();
          if (!declaration) throw new Error(`No declaration resolved for ${name}:${symbol.name}`);
          return { name: symbol.name, signature: normalizeDeclaration(project.emitter.printNode(declaration)) };
        }).sort((left, right) => left.name.localeCompare(right.name));
        return { packageName: name, exports };
      }).sort((left, right) => left.packageName.localeCompare(right.packageName));
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function mapBy(items, key) {
  return new Map(items.map(item => [item[key], item]));
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function comparePublicSurface(baseline, current) {
  const findings = [];
  const requireEntries = (area, baselineItems, currentItems, key, fields) => {
    const currentByKey = mapBy(currentItems ?? [], key);
    for (const expected of baselineItems ?? []) {
      const actual = currentByKey.get(expected[key]);
      if (!actual) { findings.push({ code: `${area}.removed`, detail: `${area} removed: ${expected[key]}` }); continue; }
      for (const field of fields) {
        if (!same(expected[field], actual[field])) findings.push({ code: `${area}.${field}.changed`, detail: `${area} ${expected[key]} changed ${field}` });
      }
    }
  };

  if (baseline?.schema !== 'q1x.phase14-public-surface.v1' || current?.schema !== baseline.schema) {
    findings.push({ code: 'surface.schema', detail: 'Public-surface inventory schema mismatch' });
    return { ok: false, findings };
  }
  if (!same(baseline.cli?.outputContract, current.cli?.outputContract)) findings.push({ code: 'cli.output.changed', detail: 'CLI output contract changed' });
  requireEntries('package', baseline.packages, current.packages, 'name', ['directory', 'exports', 'bin', 'engines', 'license']);
  requireEntries('schema', baseline.contracts?.schemas, current.contracts?.schemas, 'id', ['file', 'sha256']);
  const currentTypes = mapBy(current.typeExports ?? [], 'packageName');
  for (const expectedPackage of baseline.typeExports ?? []) {
    const actualPackage = currentTypes.get(expectedPackage.packageName);
    if (!actualPackage) {
      findings.push({ code: 'types.removed', detail: `types removed: ${expectedPackage.packageName}` });
      continue;
    }
    const actualExports = mapBy(actualPackage.exports ?? [], 'name');
    for (const expectedExport of expectedPackage.exports ?? []) {
      const actualExport = actualExports.get(expectedExport.name);
      if (!actualExport) {
        findings.push({ code: 'types.export.removed', detail: `type export removed: ${expectedPackage.packageName}:${expectedExport.name}` });
      } else if (expectedExport.signature !== actualExport.signature) {
        findings.push({ code: 'types.signature.changed', detail: `type export changed: ${expectedPackage.packageName}:${expectedExport.name}` });
      }
    }
  }
  requireEntries('cli', baseline.cli?.commands, current.cli?.commands, 'usage', []);
  requireEntries('connector', baseline.connectors, current.connectors, 'id', ['category', 'protocol', 'requirementCommands', 'environmentKeys', 'profile']);
  return { ok: findings.length === 0, findings };
}

export async function collectPublicSurface(rootInput) {
  const root = resolve(rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput);
  await ensureBuild(root);
  const packages = await packageInventory(root);
  const [{ CLI_OUTPUT_CONTRACT, getCliCommandCatalogue }, { loadBuiltInConnectorCatalogue }] = await Promise.all([
    import(pathToFileURL(join(root, 'packages/runtime/dist/cli-catalogue.js')).href),
    import(pathToFileURL(join(root, 'packages/runtime/dist/connectors/catalogue.js')).href),
  ]);
  const schemas = await schemaInventory(root);
  const typeExports = declarationExports(root, packages);
  const cliCommands = getCliCommandCatalogue().map(({ usage, purpose }) => ({ usage, purpose })).sort((a, b) => a.usage.localeCompare(b.usage));
  const connectors = loadBuiltInConnectorCatalogue().map(item => ({
    id: item.id,
    category: item.category,
    protocol: item.protocol,
    requirementCommands: [...(item.requirements.commands ?? [])].sort(),
    environmentKeys: [...(item.requirements.environmentKeys ?? [])].sort(),
    profile: { kind: item.profile.kind, platform: item.profile.platform ?? null, template: item.profile.template ?? null },
  })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    schema: 'q1x.phase14-public-surface.v1',
    contracts: { family: 'v1', schemas },
    packages,
    typeExports,
    cli: { outputContract: canonical(CLI_OUTPUT_CONTRACT), commands: cliCommands },
    connectors,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const inventory = await collectPublicSurface(root);
  const writeTarget = option('--write');
  const checkTarget = option('--check');
  if (writeTarget && checkTarget) throw new Error('Use only one of --write or --check');
  if (writeTarget) {
    await writeFile(resolve(root, writeTarget), `${JSON.stringify(inventory, null, 2)}\n`);
  } else if (checkTarget) {
    const baseline = JSON.parse(await readFile(resolve(root, checkTarget), 'utf8'));
    const result = comparePublicSurface(baseline, inventory);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
  }
}
