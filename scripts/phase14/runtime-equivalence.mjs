import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNTIME_NEUTRAL_PREFIXES = Object.freeze([
  '.github/workflows/', 'docs/', 'tests/', 'compatibility/evidence/',
]);
export const RUNTIME_NEUTRAL_EXACT = Object.freeze([
  'scripts/phase14/verify-completion.mjs',
]);
function normalized(path) { return String(path).replaceAll('\\', '/').replace(/^\.\//, ''); }
function neutral(path) {
  return RUNTIME_NEUTRAL_EXACT.includes(path) || RUNTIME_NEUTRAL_PREFIXES.some(prefix => path.startsWith(prefix));
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
  const output = execFileSync('git', ['diff', '--name-only', fromSha, toSha, '--'], {
    cwd: resolve(root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { fromSha, toSha, ...evaluateRuntimeEquivalence(output.split(/\r?\n/).filter(Boolean)) };
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
