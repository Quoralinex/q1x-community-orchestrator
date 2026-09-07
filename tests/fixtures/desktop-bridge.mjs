let input = '';
for await (const chunk of process.stdin) input += chunk;
const envelope = JSON.parse(input || '{}');
const batch = envelope.batch ?? {};
const mode = batch.metadata?.fixtureMode;

if (mode === 'delay') {
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (mode === 'overflow') {
  process.stdout.write('x'.repeat(16384));
  process.exit(0);
}
if (mode === 'fail') {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: { code: 'FIXTURE_FAILURE', message: 'Synthetic bridge failure', retryable: false }
  }));
  process.exit(0);
}

const now = new Date().toISOString();
const actions = (batch.actions ?? []).map(action => ({
  id: action.id,
  status: 'succeeded',
  durationMs: 1,
  output: {
    kind: action.kind,
    application: action.application,
    text: action.text,
    outputPath: action.outputPath,
    mappedEnvironment: process.env.Q1X_BRIDGE_TEST ?? null,
    inheritedSecret: process.env.Q1X_SHOULD_NOT_INHERIT ?? null
  }
}));

process.stdout.write(JSON.stringify({
  ok: true,
  result: {
    contractVersion: '1.0.0',
    id: `${batch.id}.result`,
    batchId: batch.id,
    status: 'succeeded',
    actions,
    startedAt: now,
    finishedAt: new Date().toISOString()
  }
}));
