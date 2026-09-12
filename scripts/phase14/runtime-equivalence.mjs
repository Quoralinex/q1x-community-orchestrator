import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNTIME_NEUTRAL_PREFIXES = Object.freeze([
  '.github/workflows/', 'docs/', 'tests/', 'compatibility/evidence/',
]);
export const RUNTIME_NEUTRAL_EXACT = Object.freeze([
  'scripts/phase14/verify-completion.mjs',
  'compatibility/matrix.json',
  'compatibility/public-surface.rc1.json',
  'compatibility/package-surface.rc1.json',
]);
function normalized(path) { return String(path).replaceAll('\\', '/').replace(/^\.\//, ''); }
function neutral(path) {
  return RUNTIME_NEUTRAL_EXACT.includes(path) || RUNTIME_NEUTRAL_PREFIXES.some(prefix => path.startsWith(prefix));
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
  delete beforeScripts.check;
  delete afterScripts.check;
  delete beforeScripts['verify:phase14'];
  delete afterScripts['verify:phase14'];
  if (JSON.stringify(beforeScripts) !== JSON.stringify(afterScripts)) return false;

  const verifyCommand = 'node scripts/phase14/verify-completion.mjs';
  if (afterVerify !== verifyCommand) return false;
  if (beforeVerify !== undefined && beforeVerify !== verifyCommand) return false;
  if (typeof beforeCheck !== 'string' || typeof afterCheck !== 'string') return false;
  const expectedCheck = beforeCheck.includes('npm run verify:phase14')
    ? beforeCheck
    : `${beforeCheck} && npm run verify:phase14`;
  return afterCheck === expectedCheck;
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
  if (report.invalidatingPaths.includes('package.json')) {
    try {
      const before = JSON.parse(execFileSync('git', ['show', `${fromSha}:package.json`], { cwd, encoding: 'utf8' }));
      const after = JSON.parse(execFileSync('git', ['show', `${toSha}:package.json`], { cwd, encoding: 'utf8' }));
      if (isCompletionWiringOnlyPackageChange(before, after)) neutralizedPaths.push('package.json');
    } catch {}
  }
  const invalidatingPaths = report.invalidatingPaths.filter(path => !neutralizedPaths.includes(path));
  return {
    fromSha, toSha, ...report,
    equivalent: invalidatingPaths.length === 0,
    invalidatingPaths,
    neutralizedPaths,
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
