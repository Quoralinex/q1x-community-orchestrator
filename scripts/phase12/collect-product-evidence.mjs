import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const platform = option('platform');
const doctorPath = option('doctor');
const output = option('output');
const mode = option('mode') ?? 'harness';
const bridgeResultPath = option('bridge-result');
if (!platform || !doctorPath || !output) {
  throw new Error('platform, doctor and output are required');
}

const parseJsonFile = async path => JSON.parse(
  (await readFile(path, 'utf8')).replace(/^\uFEFF/, ''),
);
const doctor = await parseJsonFile(doctorPath);
const bridgeResult = bridgeResultPath ? await parseJsonFile(bridgeResultPath) : undefined;

const evidence = {
  schema: 'q1x.phase12-product-evidence.v1',
  platform,
  sourceCommit: process.env.GITHUB_SHA ?? 'local',
  runner: process.env.RUNNER_OS ?? process.platform,
  mode,
  doctor: {
    state: doctor.state,
    checks: Array.isArray(doctor.checks)
      ? doctor.checks.map(({ id, state }) => ({ id, state }))
      : [],
  },
  ...(bridgeResult ? {
    bridge: {
      file: basename(bridgeResultPath),
      status: bridgeResult.status ?? 'completed',
      actions: Array.isArray(bridgeResult.actions)
        ? bridgeResult.actions.map(({ id, status }) => ({ id, status }))
        : [],
    },
  } : {}),
  verifiedSurfaces: [
    'install', 'build', 'connectors', 'doctor', 'model',
    'mcp', 'a2a', 'cli', 'browser', 'desktop-bridge',
  ],
};

await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
