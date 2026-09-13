import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNTIME_NEUTRAL_PREFIXES = Object.freeze([
  '.github/workflows/', 'docs/', 'tests/', 'compatibility/evidence/',
]);
export const RUNTIME_NEUTRAL_EXACT = Object.freeze([
  '.github/dependabot.yml',
  'scripts/phase14/runtime-equivalence.mjs',
  'scripts/phase14/verify-completion.mjs',
  'compatibility/matrix.json',
  'compatibility/public-surface.rc1.json',
  'compatibility/package-surface.rc1.json',
]);
function normalized(path) { return String(path).replaceAll('\\', '/').replace(/^\.\//, ''); }
function neutral(path) {
  return RUNTIME_NEUTRAL_EXACT.includes(path) || RUNTIME_NEUTRAL_PREFIXES.some(prefix => path.startsWith(prefix));
}
function node24Range(value) {
  return typeof value === 'string' && /^\^24\.\d+\.\d+$/.test(value);
}
function node24Version(value) {
  return typeof value === 'string' && /^24\.\d+\.\d+$/.test(value);
}
function npmNodeTypesRecord(record) {
  if (!record || typeof record !== 'object' || record.dev !== true || !node24Version(record.version)) return false;
  if (record.resolved !== `https://registry.npmjs.org/@types/node/-/node-${record.version}.tgz`) return false;
  return typeof record.integrity === 'string' && record.integrity.startsWith('sha512-');
}

export function isCompletionWiringOnlyPackageChange(beforeInput, afterInput) {
  if (!beforeInput || !afterInput || typeof beforeInput !== 'object' || typeof afterInput !== 'object') return false;
  const before = structuredClone(beforeInput);
  const after = structuredClone(afterInput);
  const beforeScripts = { ...(before.scripts ?? {}) };
  const afterScripts = { ...(after.scripts ?? {}) };
  delete before.scripts;
  delete after.scripts;
  if (JSON.stringify(before) !== JSON.stringify(after)) return false;

  const beforeCheck = beforeScripts.check;
  const afterCheck = afterScripts.check;
  const beforeVerify = beforeScripts['verify:phase14'];
  const afterVerify = afterScripts['verify:phase14'];
  const beforeTest = beforeScripts.test;
  const afterTest = afterScripts.test;
  delete beforeScripts.check;
  delete afterScripts.check;
  delete beforeScripts['verify:phase14'];
  delete afterScripts['verify:phase14'];
  delete beforeScripts.test;
  delete afterScripts.test;
  if (JSON.stringify(beforeScripts) !== JSON.stringify(afterScripts)) return false;

  const verifyCommand = 'node scripts/phase14/verify-completion.mjs';
  if (afterVerify !== verifyCommand) return false;
  if (beforeVerify !== undefined && beforeVerify !== verifyCommand) return false;
  if (typeof beforeCheck !== 'string' || typeof afterCheck !== 'string') return false;
  const expectedCheck = beforeCheck.includes('npm run verify:phase14')
    ? beforeCheck
    : `${beforeCheck} && npm run verify:phase14`;
  if (afterCheck !== expectedCheck) return false;

  const expectedTest = typeof beforeTest === 'string'
    ? `${beforeTest} tests/phase14-docs.test.mjs`
    : undefined;
  return afterTest === beforeTest || afterTest === expectedTest;
}

export function isNode24TypesRuntimeNeutralPackageChange(beforeInput, afterInput) {
  if (!beforeInput || !afterInput || typeof beforeInput !== 'object' || typeof afterInput !== 'object') return false;
  const beforeRange = beforeInput.devDependencies?.['@types/node'];
  const afterRange = afterInput.devDependencies?.['@types/node'];
  if (!node24Range(beforeRange) || !node24Range(afterRange) || beforeRange === afterRange) return false;
  const before = structuredClone(beforeInput);
  const after = structuredClone(afterInput);
  after.devDependencies['@types/node'] = before.devDependencies['@types/node'];
  return isCompletionWiringOnlyPackageChange(before, after);
}

export function isNode24TypesOnlyLockfileChange(beforeInput, afterInput) {
  if (!beforeInput || !afterInput || typeof beforeInput !== 'object' || typeof afterInput !== 'object') return false;
  const before = structuredClone(beforeInput);
  const after = structuredClone(afterInput);
  const beforeRoot = before.packages?.[''];
  const afterRoot = after.packages?.[''];
  const beforeRecord = before.packages?.['node_modules/@types/node'];
  const afterRecord = after.packages?.['node_modules/@types/node'];
  const beforeRange = beforeRoot?.devDependencies?.['@types/node'];
  const afterRange = afterRoot?.devDependencies?.['@types/node'];
  if (!node24Range(beforeRange) || !node24Range(afterRange) || beforeRange === afterRange) return false;
  if (!npmNodeTypesRecord(beforeRecord) || !npmNodeTypesRecord(afterRecord)) return false;
  if (beforeRecord.version === afterRecord.version) return false;

  afterRoot.devDependencies['@types/node'] = beforeRange;
  for (const key of ['version', 'resolved', 'integrity']) afterRecord[key] = beforeRecord[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

export function evaluateRuntimeEquivalence(changedPaths) {
  const changed = [...new Set((changedPaths ?? []).map(normalized).filter(Boolean))].sort();
  const invalidatingPaths = changed.filter(path => !neutral(path));
  return {
    schema: 'q1x.phase14-runtime-equivalence.v1',
    equivalent: invalidatingPaths.length === 0,
    changedPaths: changed,
    invalidatingPaths,
  };
}

export function runtimeEquivalenceBetween({ root = process.cwd(), fromSha, toSha }) {
  for (const [name, value] of [['fromSha', fromSha], ['toSha', toSha]]) {
    if (!/^[0-9a-f]{40}$/i.test(value ?? '')) throw new Error(`${name} must be a 40-character Git commit SHA`);
  }
  const cwd = resolve(root);
  const output = execFileSync('git', ['diff', '--name-only', fromSha, toSha, '--'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const report = evaluateRuntimeEquivalence(output.split(/\r?\n/).filter(Boolean));
  const neutralizedPaths = [];
  let beforePackage;
  let afterPackage;
  if (report.invalidatingPaths.includes('package.json')) {
    try {
      beforePackage = JSON.parse(execFileSync('git', ['show', `${fromSha}:package.json`], { cwd, encoding: 'utf8' }));
      afterPackage = JSON.parse(execFileSync('git', ['show', `${toSha}:package.json`], { cwd, encoding: 'utf8' }));
      if (isCompletionWiringOnlyPackageChange(beforePackage, afterPackage)) neutralizedPaths.push('package.json');
    } catch {}
  }
  if (report.invalidatingPaths.includes('package.json') && report.invalidatingPaths.includes('package-lock.json')) {
    try {
      beforePackage ??= JSON.parse(execFileSync('git', ['show', `${fromSha}:package.json`], { cwd, encoding: 'utf8' }));
      afterPackage ??= JSON.parse(execFileSync('git', ['show', `${toSha}:package.json`], { cwd, encoding: 'utf8' }));
      const beforeLock = JSON.parse(execFileSync('git', ['show', `${fromSha}:package-lock.json`], { cwd, encoding: 'utf8' }));
      const afterLock = JSON.parse(execFileSync('git', ['show', `${toSha}:package-lock.json`], { cwd, encoding: 'utf8' }));
      if (
        isNode24TypesRuntimeNeutralPackageChange(beforePackage, afterPackage)
        && isNode24TypesOnlyLockfileChange(beforeLock, afterLock)
      ) {
        neutralizedPaths.push('package.json', 'package-lock.json');
      }
    } catch {}
  }
  const uniqueNeutralizedPaths = [...new Set(neutralizedPaths)].sort();
  const invalidatingPaths = report.invalidatingPaths.filter(path => !uniqueNeutralizedPaths.includes(path));
  return {
    fromSha, toSha, ...report,
    equivalent: invalidatingPaths.length === 0,
    invalidatingPaths,
    neutralizedPaths: uniqueNeutralizedPaths,
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = runtimeEquivalenceBetween({
    root: option('--root') ?? process.cwd(), fromSha: option('--from'), toSha: option('--to'),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.equivalent) process.exitCode = 1;
}
