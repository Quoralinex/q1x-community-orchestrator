import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSoak } from '../phase13/run-soak.mjs';

function validateSourceSha(sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('sourceSha must be a 40-character Git commit SHA');
  }
}
export async function runStableSoak({ sourceSha, minutes, testOnlyAllowShortRun = false }) {
  validateSourceSha(sourceSha);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('minutes must be a non-negative number');
  if (minutes < 360 && !testOnlyAllowShortRun) throw new Error('Stable soak must run for at least 360 minutes');
  const phase13 = await runSoak({ sourceSha, minutes });
  return {
    ...phase13,
    schema: 'q1x.phase14-soak-evidence.v1',
    unresolvedExternalOperations: phase13.unresolvedExternalOperations ?? 0,
    limitBreaches: phase13.limitBreaches ?? [],
    state: phase13.state === 'passed'
      && (phase13.unresolvedExternalOperations ?? 0) === 0
      && (phase13.limitBreaches ?? []).length === 0 ? 'passed' : 'failed',
  };
}
function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sourceSha = option('--source-sha');
  if (!sourceSha) throw new Error('--source-sha is required');
  const minutes = Number(option('--minutes'));
  if (!Number.isFinite(minutes)) throw new Error('--minutes <n> is required');
  const report = await runStableSoak({ sourceSha, minutes });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'passed') process.exitCode = 1;
}
